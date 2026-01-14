#!/usr/bin/env python3
"""The Visa Gatekeeper: Watches for candidate replies and processes visa status."""

import json
import base64
from email.mime.text import MIMEText

from utils import get_supabase_client, get_gmail_service, get_gemini_client, log

# --- Configuration ---
COMPANY_NAME = "Printerpix"
INTERVIEW_BASE_URL = "https://intervieww-fw4n.vercel.app/interview"

VISA_CHECK_PROMPT = """The candidate was asked 'Are you on an Employer Visa or a Personal Visa?'.

Their reply: '{reply_text}'

Analyze their response and determine if they have valid work authorization.
- Personal Visa, Green Card, Golden Visa, Permanent Resident = TRUE (valid)
- Employer Visa, Needs Sponsorship, Work Permit Required = FALSE (not valid)

Return ONLY a valid JSON object: {{"has_valid_visa": true}} or {{"has_valid_visa": false}}"""

APPROVAL_EMAIL = """Hi {full_name},

Thanks for confirming! You are invited to an AI Interview.

Please use this link to complete your interview: {interview_link}

Best,
{company_name} Recruiting
"""

REJECTION_EMAIL = """Hi {full_name},

Thank you for your transparency. Unfortunately, we require a personal visa/work authorization at this time.

We will keep your resume on file for future opportunities.

Best of luck in your job search!

{company_name} Recruiting
"""


def fetch_questionnaire_candidates(supabase):
    """Fetch candidates who were sent the questionnaire."""
    result = (
        supabase.table("candidates")
        .select("id, email, full_name, interview_token")
        .eq("status", "QUESTIONNAIRE_SENT")
        .execute()
    )
    return result.data


def search_unread_from(gmail_service, email: str):
    """Search for unread emails from a specific sender."""
    query = f"from:{email} is:unread"
    result = gmail_service.users().messages().list(userId="me", q=query).execute()
    return result.get("messages", [])


def get_email_body(gmail_service, msg_id: str) -> str:
    """Extract the body/snippet from an email message."""
    msg = gmail_service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    
    # Try to get the snippet (short preview) first - it's usually enough
    snippet = msg.get("snippet", "")
    if snippet:
        return snippet
    
    # If no snippet, try to extract from payload
    payload = msg.get("payload", {})
    
    # Check for plain text body
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8")
    
    # Check parts for multipart messages
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data).decode("utf-8")
    
    return ""


def analyze_visa_status(gemini_client, reply_text: str) -> bool:
    """Use Gemini to analyze if candidate has valid visa."""
    prompt = VISA_CHECK_PROMPT.format(reply_text=reply_text)
    
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )
    
    response_text = response.text.strip()
    
    # Handle potential markdown code blocks
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()
    
    result = json.loads(response_text)
    return result.get("has_valid_visa", False)


def create_email_message(to_email: str, subject: str, body: str) -> dict:
    """Create an email message for the Gmail API."""
    message = MIMEText(body)
    message["to"] = to_email
    message["subject"] = subject
    
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw_message}


def send_approval_email(gmail_service, email: str, full_name: str, interview_token: str):
    """Send the AI interview invitation with secure token link."""
    interview_link = f"{INTERVIEW_BASE_URL}/{interview_token}"
    body = APPROVAL_EMAIL.format(
        full_name=full_name,
        interview_link=interview_link,
        company_name=COMPANY_NAME
    )
    subject = f"You're Invited - AI Interview with {COMPANY_NAME}"
    message = create_email_message(email, subject, body)
    gmail_service.users().messages().send(userId="me", body=message).execute()


def send_rejection_email(gmail_service, email: str, full_name: str):
    """Send the rejection email."""
    body = REJECTION_EMAIL.format(
        full_name=full_name,
        company_name=COMPANY_NAME
    )
    subject = f"Update on your application to {COMPANY_NAME}"
    message = create_email_message(email, subject, body)
    gmail_service.users().messages().send(userId="me", body=message).execute()


def mark_as_read(gmail_service, msg_id: str):
    """Remove the UNREAD label from an email."""
    gmail_service.users().messages().modify(
        userId="me", id=msg_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()


def update_candidate_status(supabase, candidate_id: int, status: str):
    """Update the candidate's status in Supabase."""
    supabase.table("candidates").update({
        "status": status
    }).eq("id", candidate_id).execute()


def main():
    log("INFO", "Starting visa gatekeeper...")
    
    supabase = get_supabase_client()
    gmail_service = get_gmail_service()
    gemini_client = get_gemini_client()
    
    candidates = fetch_questionnaire_candidates(supabase)
    log("INFO", f"Found {len(candidates)} candidate(s) awaiting reply")
    
    if not candidates:
        log("INFO", "No candidates to process")
        return
    
    processed, skipped = 0, 0
    
    for candidate in candidates:
        try:
            email = candidate["email"]
            full_name = candidate.get("full_name", "Candidate")
            candidate_id = candidate["id"]
            interview_token = candidate.get("interview_token")
            
            if not interview_token:
                log("WARN", f"No interview_token for {email}, skipping")
                skipped += 1
                continue
            
            # Search for unread replies from this candidate
            messages = search_unread_from(gmail_service, email)
            
            if not messages:
                # No reply yet - skip silently
                skipped += 1
                continue
            
            # Process the first unread message
            msg_id = messages[0]["id"]
            reply_text = get_email_body(gmail_service, msg_id)
            
            if not reply_text:
                log("WARN", f"Empty reply from {email}, skipping")
                skipped += 1
                continue
            
            log("INFO", f"Processing reply from {email}...")
            
            # Analyze visa status with Gemini
            has_valid_visa = analyze_visa_status(gemini_client, reply_text)
            
            if has_valid_visa:
                send_approval_email(gmail_service, email, full_name, interview_token)
                update_candidate_status(supabase, candidate_id, "INVITE_SENT")
                log("INFO", f"Processed {email}: Visa Valid? True - Invite sent with token")
            else:
                send_rejection_email(gmail_service, email, full_name)
                update_candidate_status(supabase, candidate_id, "REJECTED_VISA")
                log("INFO", f"Processed {email}: Visa Valid? False - Rejected")
            
            # Mark the email as read so we don't process it again
            mark_as_read(gmail_service, msg_id)
            processed += 1
            
        except Exception as e:
            log("ERROR", f"Failed to process {candidate.get('email', 'unknown')}: {e}")
    
    log("INFO", f"Gatekeeper complete: {processed} processed, {skipped} awaiting reply")


if __name__ == "__main__":
    main()

