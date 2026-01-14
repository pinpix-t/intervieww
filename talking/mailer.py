#!/usr/bin/env python3
"""The Voice: Sends questionnaires to Dubai candidates OR interview links to others."""

import base64
from email.mime.text import MIMEText

from utils import get_supabase_client, get_gmail_service, log

# --- Configuration ---
COMPANY_NAME = "Printerpix"
MIN_SCORE = 70
INTERVIEW_BASE_URL = "https://intervieww-fw4n.vercel.app/interview"

# Dubai questionnaire email
DUBAI_EMAIL_SUBJECT = f"Quick Questions regarding your application to {COMPANY_NAME}"

DUBAI_EMAIL_BODY = """Hi {full_name},

Thanks for applying to {company_name}. Your profile looks interesting!

Before we proceed, could you please answer the following questions by replying to this email?

1. Are you currently residing in Dubai?

2. Which visa do you currently hold that allows you to work with a new employer in the UAE (without the need of a labour transfer)? When does the visa expire?

3. On a scale of 1 to 5, how would you rate your:
   - English speaking skills? (1 = basic, 5 = fluent)
   - English writing skills? (1 = basic, 5 = fluent)

4. Have you graduated and completed your studies?

5. If successful, can you commit to working a minimum of 12 months?

6. This is an onsite role based in our new Downtown office, working Mon-Friday. Does this work for you?

7. Can you also confirm your earliest availability to start the role if successful?

Please do ensure you revisit the job advert with regards to salary on offer - we wouldn't want to waste your time.

Best,
{company_name} Recruiting
"""

# Direct interview invite (non-Dubai)
INVITE_EMAIL_SUBJECT = f"You're Invited - AI Interview with {COMPANY_NAME}"

INVITE_EMAIL_BODY = """Hi {full_name},

Great news! We've reviewed your application and would like to invite you to an AI Interview.

Please use this secure link to complete your interview:
{interview_link}

The interview takes about 10-15 minutes and can be done at your convenience.

Best of luck!
{company_name} Recruiting
"""


def fetch_top_candidates(supabase):
    """Fetch graded candidates with score >= MIN_SCORE including job_description and interview_token."""
    result = (
        supabase.table("candidates")
        .select("id, email, full_name, jd_match_score, job_description, interview_token")
        .eq("status", "GRADED")
        .gte("jd_match_score", MIN_SCORE)
        .execute()
    )
    return result.data


def is_dubai_role(job_description: str) -> bool:
    """Check if the job description mentions Dubai."""
    if not job_description:
        return False
    return "dubai" in job_description.lower()


def create_email(to_email: str, subject: str, body: str) -> dict:
    """Create an email message for the Gmail API."""
    message = MIMEText(body)
    message["to"] = to_email
    message["subject"] = subject
    
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw_message}


def send_dubai_questionnaire(gmail_service, email: str, full_name: str):
    """Send the Dubai-specific questionnaire."""
    body = DUBAI_EMAIL_BODY.format(
        full_name=full_name,
        company_name=COMPANY_NAME
    )
    message = create_email(email, DUBAI_EMAIL_SUBJECT, body)
    gmail_service.users().messages().send(userId="me", body=message).execute()


def send_interview_invite(gmail_service, email: str, full_name: str, interview_token: str):
    """Send direct interview invite with secure token link."""
    interview_link = f"{INTERVIEW_BASE_URL}/{interview_token}"
    body = INVITE_EMAIL_BODY.format(
        full_name=full_name,
        interview_link=interview_link,
        company_name=COMPANY_NAME
    )
    message = create_email(email, INVITE_EMAIL_SUBJECT, body)
    gmail_service.users().messages().send(userId="me", body=message).execute()


def update_candidate_status(supabase, candidate_id: int, status: str):
    """Update candidate status."""
    supabase.table("candidates").update({
        "status": status
    }).eq("id", candidate_id).execute()


def main():
    log("INFO", "Starting outreach to top candidates...")
    
    supabase = get_supabase_client()
    gmail_service = get_gmail_service()
    
    candidates = fetch_top_candidates(supabase)
    log("INFO", f"Found {len(candidates)} candidate(s) with score >= {MIN_SCORE}")
    
    if not candidates:
        log("INFO", "No candidates to contact")
        return
    
    dubai_sent, invites_sent, failed = 0, 0, 0
    
    for candidate in candidates:
        try:
            email = candidate["email"]
            full_name = candidate.get("full_name", "Candidate")
            score = candidate.get("jd_match_score", 0)
            job_description = candidate.get("job_description", "")
            interview_token = candidate.get("interview_token")
            candidate_id = candidate["id"]
            
            if is_dubai_role(job_description):
                # Dubai role → Send questionnaire, wait for reply
                log("INFO", f"Dubai role detected for {email} (score: {score})")
                send_dubai_questionnaire(gmail_service, email, full_name)
                update_candidate_status(supabase, candidate_id, "QUESTIONNAIRE_SENT")
                log("SUCCESS", f"Dubai questionnaire sent to {email}")
                dubai_sent += 1
            else:
                # Non-Dubai role → Send interview link directly
                if not interview_token:
                    log("WARN", f"No interview_token for {email}, skipping")
                    failed += 1
                    continue
                    
                log("INFO", f"Non-Dubai role for {email} (score: {score}) - sending interview invite")
                send_interview_invite(gmail_service, email, full_name, interview_token)
                update_candidate_status(supabase, candidate_id, "INVITE_SENT")
                log("SUCCESS", f"Interview invite sent to {email}")
                invites_sent += 1
            
        except Exception as e:
            log("ERROR", f"Failed to process {candidate.get('email', 'unknown')}: {e}")
            failed += 1
    
    log("INFO", f"Outreach complete: {dubai_sent} Dubai questionnaires, {invites_sent} interview invites, {failed} failed")


if __name__ == "__main__":
    main()
