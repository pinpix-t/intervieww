#!/usr/bin/env python3
"""
The Commander: Runs the full recruiting pipeline continuously.

This is the main entry point for Railway deployment.
It runs all scripts in sequence on a loop:
1. Check for email replies (visa gatekeeper)
2. Ingest new applications
3. Grade candidates
4. Send outreach emails

Then sleeps and repeats.
"""

import sys
import time
import json
import base64
from pathlib import Path
from email.mime.text import MIMEText

# Add read/ directory to path for importing ingest
sys.path.insert(0, str(Path(__file__).parent.parent / "read"))

from utils import get_supabase_client, get_gmail_service, get_gemini_client, log

# Import the other modules' run functions
from grader import run_grader
from mailer import run_mailer

# For ingest, we need to handle the import differently since it's in a different folder
try:
    from ingest import run_ingest
except ImportError:
    # If import fails, define a stub that logs the error
    def run_ingest():
        log("WARN", "Could not import ingest module - skipping")
        return 0

# --- Configuration ---
COMPANY_NAME = "Printerpix"
INTERVIEW_BASE_URL = "https://intervieww-fw4n.vercel.app/interview"
LOOP_INTERVAL_SECONDS = 60  # How often to run the pipeline

VISA_CHECK_PROMPT = """The candidate was asked about their visa/work authorization status.

Their reply: '{reply_text}'

Analyze their response and determine if they have valid work authorization that allows them to work with a NEW employer without sponsorship.

VALID (return true):
- Personal Visa, Golden Visa, Green Card, Permanent Resident
- Freelance Visa, Investor Visa, Family Visa
- UAE National, GCC National, Citizen
- Already has work permit / residency that allows job change

INVALID (return false):
- Employer Visa / Employment Visa (tied to current employer)
- Needs Sponsorship / Labour Transfer
- Tourist Visa, Visit Visa
- No valid visa / Expired visa
- Student Visa (unless they specify they can work)

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


# --- Visa Gatekeeper Functions ---
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
    
    # Use JSON mode for guaranteed valid JSON output
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
        }
    )
    
    response_text = response.text.strip()
    
    try:
        result = json.loads(response_text)
        return result.get("has_valid_visa", False)
    except json.JSONDecodeError:
        # Fallback: check the CANDIDATE'S REPLY (not Gemini's response) for valid visa keywords
        log("WARN", f"Gemini JSON parse failed. Checking candidate reply directly...")
        candidate_reply_lower = reply_text.lower()
        
        # Valid visa keywords
        valid_keywords = [
            "golden visa", "gold visa", "personal visa", "freelance visa",
            "investor visa", "family visa", "green card", "permanent resident",
            "citizen", "national", "residency", "work permit"
        ]
        
        # Invalid visa keywords (check these first)
        invalid_keywords = [
            "employer visa", "employment visa", "need sponsor", "sponsorship",
            "tourist visa", "visit visa", "no visa", "expired"
        ]
        
        for keyword in invalid_keywords:
            if keyword in candidate_reply_lower:
                log("INFO", f"Fallback detected INVALID keyword: '{keyword}'")
                return False
        
        for keyword in valid_keywords:
            if keyword in candidate_reply_lower:
                log("INFO", f"Fallback detected VALID keyword: '{keyword}'")
                return True
        
        log("WARN", f"Fallback couldn't determine visa status. Defaulting to VALID to avoid false rejections.")
        return True  # Default to valid to avoid wrongly rejecting candidates


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


def run_listener() -> int:
    """
    Check for email replies from candidates (visa gatekeeper).
    Returns the number of candidates processed.
    """
    log("INFO", "Checking for candidate replies...")
    
    supabase = get_supabase_client()
    gmail_service = get_gmail_service()
    gemini_client = get_gemini_client()
    
    candidates = fetch_questionnaire_candidates(supabase)
    log("INFO", f"Found {len(candidates)} candidate(s) awaiting reply")
    
    if not candidates:
        return 0
    
    processed = 0
    
    for candidate in candidates:
        try:
            email = candidate["email"]
            full_name = candidate.get("full_name", "Candidate")
            candidate_id = candidate["id"]
            interview_token = candidate.get("interview_token")
            
            if not interview_token:
                log("WARN", f"No interview_token for {email}, skipping")
                continue
            
            # Search for unread replies from this candidate
            messages = search_unread_from(gmail_service, email)
            
            if not messages:
                # No reply yet - skip silently
                continue
            
            # Process the first unread message
            msg_id = messages[0]["id"]
            reply_text = get_email_body(gmail_service, msg_id)
            
            if not reply_text:
                log("WARN", f"Empty reply from {email}, skipping")
                continue
            
            log("INFO", f"Processing reply from {email}...")
            
            # Analyze visa status with Gemini
            has_valid_visa = analyze_visa_status(gemini_client, reply_text)
            
            if has_valid_visa:
                send_approval_email(gmail_service, email, full_name, interview_token)
                update_candidate_status(supabase, candidate_id, "INVITE_SENT")
                log("INFO", f"Processed {email}: Visa Valid? True - Invite sent")
            else:
                send_rejection_email(gmail_service, email, full_name)
                update_candidate_status(supabase, candidate_id, "REJECTED_VISA")
                log("INFO", f"Processed {email}: Visa Valid? False - Rejected")
            
            # Mark the email as read so we don't process it again
            mark_as_read(gmail_service, msg_id)
            processed += 1
            
        except Exception as e:
            log("ERROR", f"Failed to process {candidate.get('email', 'unknown')}: {e}")
    
    log("INFO", f"Reply check complete: {processed} processed")
    return processed


def run_pipeline_cycle():
    """
    Run one complete cycle of the recruiting pipeline.
    
    Order:
    1. Check for replies (visa gatekeeper) - process waiting candidates first
    2. Ingest new applications from email
    3. Grade new candidates with AI
    4. Send outreach to graded candidates
    """
    log("INFO", "=" * 50)
    log("INFO", "Starting pipeline cycle...")
    log("INFO", "=" * 50)
    
    # Step 1: Check for replies to questionnaires
    try:
        replies_processed = run_listener()
        log("INFO", f"Step 1 (Listener): {replies_processed} replies processed")
    except Exception as e:
        log("ERROR", f"Step 1 (Listener) failed: {e}")
    
    # Step 2: Ingest new applications
    try:
        ingested = run_ingest()
        log("INFO", f"Step 2 (Ingest): {ingested} applications ingested")
    except Exception as e:
        log("ERROR", f"Step 2 (Ingest) failed: {e}")
    
    # Step 3: Grade candidates
    try:
        graded = run_grader()
        log("INFO", f"Step 3 (Grader): {graded} candidates graded")
    except Exception as e:
        log("ERROR", f"Step 3 (Grader) failed: {e}")
    
    # Step 4: Send outreach (DISABLED - uncomment to enable)
    # try:
    #     dubai, invites = run_mailer()
    #     log("INFO", f"Step 4 (Mailer): {dubai} questionnaires, {invites} invites sent")
    # except Exception as e:
    #     log("ERROR", f"Mailer failed: {e}")
    log("INFO", "Step 4 (Mailer): DISABLED - no emails sent")
    try:
        pass  # Placeholder to keep try block valid
    except Exception as e:
        log("ERROR", f"Step 4 (Mailer) failed: {e}")
    
    log("INFO", "Pipeline cycle complete!")


def main():
    """
    Main entry point - runs the pipeline continuously.
    This is what Railway will execute.
    """
    log("INFO", "=" * 60)
    log("INFO", "🚀 RECRUITING BOT COMMANDER STARTING")
    log("INFO", f"Loop interval: {LOOP_INTERVAL_SECONDS} seconds")
    log("INFO", "=" * 60)
    
    # Test connections on startup
    try:
        log("INFO", "Testing Supabase connection...")
        supabase = get_supabase_client()
        log("INFO", "✓ Supabase OK")
        
        log("INFO", "Testing Gmail connection...")
        gmail = get_gmail_service()
        log("INFO", "✓ Gmail OK")
        
        log("INFO", "Testing Gemini connection...")
        gemini = get_gemini_client()
        log("INFO", "✓ Gemini OK")
        
    except Exception as e:
        log("ERROR", f"Startup check failed: {e}")
        log("ERROR", "Fix the above error and restart.")
        return
    
    log("INFO", "All connections verified. Starting main loop...")
    
    # Main loop
    while True:
        try:
            run_pipeline_cycle()
        except Exception as e:
            log("ERROR", f"Pipeline cycle crashed: {e}")
            log("INFO", "Will retry on next cycle...")
        
        log("INFO", f"Sleeping for {LOOP_INTERVAL_SECONDS} seconds...")
        time.sleep(LOOP_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
