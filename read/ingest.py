#!/usr/bin/env python3
"""Recruiting bot: fetches application emails, parses resumes with Gemini, saves to Supabase."""

import os
import base64
import re
from pathlib import Path
from email.utils import parseaddr

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from supabase import create_client
from google import genai

load_dotenv()

# --- Configuration ---
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]
GMAIL_QUERY = "label:Applications is:unread"
DOWNLOADS_DIR = Path("downloads")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configure Gemini client
gemini_client = genai.Client(api_key=GEMINI_API_KEY)


def log(level: str, msg: str):
    print(f"[{level}] {msg}")


# --- Gmail ---
def authenticate_gmail():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", GMAIL_SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", GMAIL_SCOPES)
            creds = flow.run_local_server(port=0)
        Path("token.json").write_text(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def fetch_unread_emails(gmail):
    result = gmail.users().messages().list(userId="me", q=GMAIL_QUERY).execute()
    return result.get("messages", [])


def get_sender(gmail, msg_id):
    msg = gmail.users().messages().get(
        userId="me", id=msg_id, format="metadata", metadataHeaders=["From"]
    ).execute()
    from_header = next(
        (h["value"] for h in msg["payload"]["headers"] if h["name"] == "From"), ""
    )
    name, email = parseaddr(from_header)
    return email, name or "Unknown"


def get_email_subject(gmail, msg_id) -> str:
    """Extract the subject line from an email."""
    msg = gmail.users().messages().get(
        userId="me", id=msg_id, format="metadata", metadataHeaders=["Subject"]
    ).execute()
    subject = next(
        (h["value"] for h in msg["payload"]["headers"] if h["name"] == "Subject"), ""
    )
    return subject


def parse_job_title_from_subject(subject: str) -> str | None:
    """Extract job title from Betterteam format: '[Job Title] candidate - [Name] applied via Betterteam'"""
    if not subject:
        return None
    
    # Use regex to handle variable spacing around "candidate - "
    match = re.match(r"^(.+?)\s+candidate\s+-\s+", subject, re.IGNORECASE)
    
    if match:
        return match.group(1).strip()
    
    return None


def parse_name_from_subject(subject: str) -> str | None:
    """Extract candidate name from Betterteam format: '[Job Title] candidate - [Name] applied via Betterteam'"""
    if not subject:
        return None
    
    # Match: "... candidate - [Name] applied via Betterteam"
    match = re.search(r"candidate\s+-\s+(.+?)\s+applied\s+via\s+Betterteam", subject, re.IGNORECASE)
    
    if match:
        return match.group(1).strip()
    
    return None


def download_pdf(gmail, msg_id, filename_prefix):
    msg = gmail.users().messages().get(userId="me", id=msg_id, format="full").execute()
    parts = msg.get("payload", {}).get("parts", [])

    for part in parts:
        filename = part.get("filename", "")
        if not filename.lower().endswith(".pdf"):
            continue

        att_id = part.get("body", {}).get("attachmentId")
        if not att_id:
            continue

        attachment = gmail.users().messages().attachments().get(
            userId="me", messageId=msg_id, id=att_id
        ).execute()

        safe_name = re.sub(r"[^\w\-_.]", "_", filename_prefix)
        filepath = DOWNLOADS_DIR / f"{safe_name}_resume.pdf"
        filepath.write_bytes(base64.urlsafe_b64decode(attachment["data"]))
        return filepath

    return None


def mark_as_read(gmail, msg_id):
    gmail.users().messages().modify(
        userId="me", id=msg_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()


# --- Resume Parsing with Gemini ---
def parse_resume(filepath):
    log("INFO", f"Parsing resume with Gemini: {filepath}")
    
    # Upload file to Gemini
    uploaded_file = gemini_client.files.upload(file=filepath)
    
    # Use Gemini to extract text
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            uploaded_file,
            "Extract all text content from this resume PDF. Return the full text in a clean, readable format."
        ]
    )
    
    # Clean up uploaded file
    gemini_client.files.delete(name=uploaded_file.name)
    
    return response.text


# --- Supabase ---
def candidate_exists(supabase, email):
    result = supabase.table("candidates").select("id").eq("email", email).execute()
    return len(result.data) > 0


def lookup_job(supabase, job_title: str) -> dict | None:
    """Query jobs table and match title with whitespace/case normalization."""
    # Normalize the extracted title
    normalized_email_title = job_title.strip().lower()
    
    log("DEBUG", f"Looking up job: '{job_title}'")
    
    # Fetch all jobs and match in Python (handles newlines, whitespace, case)
    result = supabase.table("jobs").select("id, description, title").execute()
    
    if not result.data:
        log("DEBUG", "No jobs found in database")
        return None
    
    for job in result.data:
        db_title = job.get("title", "")
        normalized_db_title = db_title.strip().lower()
        
        if normalized_db_title == normalized_email_title:
            log("DEBUG", f"Matched: '{db_title.strip()}'")
            return job
    
    log("DEBUG", f"Extracted: '{job_title}' | No matching job in DB")
    return None


def save_candidate(supabase, email, name, resume_text, gmail_msg_id, job_id, job_description):
    supabase.table("candidates").insert({
        "email": email,
        "full_name": name,
        "resume_text": resume_text,
        "status": "NEW_APPLICATION",
        "job_id": job_id,
        "job_description": job_description,
        "metadata": {"gmail_message_id": gmail_msg_id},
    }).execute()


# --- Main Processing ---
def process_email(gmail, supabase, msg_id):
    email, sender_name = get_sender(gmail, msg_id)
    log("INFO", f"Processing {email}...")

    if not email:
        log("WARN", "No email address found, skipping")
        return

    # --- Job Router Logic ---
    subject = get_email_subject(gmail, msg_id)
    job_title = parse_job_title_from_subject(subject)
    
    if not job_title:
        log("ERROR", f"Could not parse job title from subject: '{subject}'")
        return
    
    # Parse candidate name from subject (cleaner than sender name)
    name = parse_name_from_subject(subject)
    if not name:
        log("WARN", f"Could not parse name from subject, using sender name: {sender_name}")
        name = sender_name
    
    job = lookup_job(supabase, job_title)
    
    if not job:
        log("ERROR", f"CRITICAL: Job '{job_title}' not found in DB. Skipping candidate.")
        return
    
    log("INFO", f"Matched job: {job_title} (ID: {job['id']}) | Candidate: {name}")
    # --- End Job Router ---

    if candidate_exists(supabase, email):
        log("INFO", f"{email} already exists, skipping")
        mark_as_read(gmail, msg_id)
        return

    filepath = download_pdf(gmail, msg_id, email)
    if not filepath:
        log("WARN", f"No PDF attachment for {email}, skipping")
        return

    resume_text = parse_resume(filepath)
    save_candidate(supabase, email, name, resume_text, msg_id, job["id"], job["description"])
    mark_as_read(gmail, msg_id)
    
    # Cleanup downloaded file
    filepath.unlink(missing_ok=True)
    
    log("INFO", f"Saved {email} for job: {job_title}")


def main():
    if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY]):
        log("ERROR", "Missing env vars: SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY")
        return

    gmail = authenticate_gmail()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    DOWNLOADS_DIR.mkdir(exist_ok=True)

    messages = fetch_unread_emails(gmail)
    log("INFO", f"Found {len(messages)} unread application(s)")

    if not messages:
        return

    success, failed = 0, 0
    for msg in messages:
        try:
            process_email(gmail, supabase, msg["id"])
            success += 1
        except Exception as e:
            log("ERROR", f"Failed to process {msg['id']}: {e}")
            failed += 1

    log("INFO", f"Complete: {success} succeeded, {failed} failed")


if __name__ == "__main__":
    main()
