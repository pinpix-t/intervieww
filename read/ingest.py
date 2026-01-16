#!/usr/bin/env python3
"""Recruiting bot: fetches application emails, parses resumes with Gemini, saves to Supabase."""

import os
import sys
import base64
import re
from pathlib import Path
from email.utils import parseaddr

# dotenv is optional - Railway provides env vars directly
try:
from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass  # No-op in production
from supabase import create_client
from google import genai

# Add parent directory to path so we can import from talking/utils.py
sys.path.insert(0, str(Path(__file__).parent.parent / "talking"))

from utils import get_gmail_service, get_supabase_client, get_gemini_client, log

load_dotenv()

# --- Configuration ---
GMAIL_QUERY = "label:Applications is:unread"
DOWNLOADS_DIR = Path(__file__).parent / "downloads"

# Get Gemini client (will be initialized when needed)
_gemini_client = None


def get_gemini():
    """Lazy-load the Gemini client."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = get_gemini_client()
    return _gemini_client


# --- Gmail ---
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


def get_email_body(gmail, msg_id) -> str:
    """Extract the plain text body from an email."""
    msg = gmail.users().messages().get(userId="me", id=msg_id, format="full").execute()
    
    payload = msg.get("payload", {})
    
    # Check for plain text body directly
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
    
    # Try snippet as fallback
    return msg.get("snippet", "")


def parse_candidate_email_from_body(body: str) -> str | None:
    """Extract candidate's actual email from Betterteam email body."""
    if not body:
        return None
    
    # Common patterns in Betterteam emails:
    # "Email: candidate@example.com"
    # "email: candidate@example.com"
    # "E-mail: candidate@example.com"
    patterns = [
        r"[Ee]-?mail:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        r"Email Address:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        # Generic email pattern - find any email that's not betterteam/noreply
        r"([a-zA-Z0-9._%+-]+@(?!betterteam|noreply)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, body)
        if match:
            email = match.group(1).strip()
            # Skip common system emails
            if not any(skip in email.lower() for skip in ['noreply', 'betterteam', 'no-reply']):
                return email
    
    return None


def download_resume(gmail, msg_id, filename_prefix):
    """Download resume attachment (PDF, DOCX, DOC)."""
    msg = gmail.users().messages().get(userId="me", id=msg_id, format="full").execute()
    parts = msg.get("payload", {}).get("parts", [])
    
    # Supported resume formats
    valid_extensions = ('.pdf', '.docx', '.doc')

    for part in parts:
        filename = part.get("filename", "")
        if not filename.lower().endswith(valid_extensions):
            continue

        att_id = part.get("body", {}).get("attachmentId")
        if not att_id:
            continue

        attachment = gmail.users().messages().attachments().get(
            userId="me", messageId=msg_id, id=att_id
        ).execute()

        # Keep original extension
        ext = Path(filename).suffix.lower()
        safe_name = re.sub(r"[^\w\-_.]", "_", filename_prefix)
        filepath = DOWNLOADS_DIR / f"{safe_name}_resume{ext}"
        filepath.write_bytes(base64.urlsafe_b64decode(attachment["data"]))
        return filepath

    return None


def mark_as_read(gmail, msg_id):
    gmail.users().messages().modify(
        userId="me", id=msg_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()


# --- Resume Parsing with Gemini ---
def extract_text_from_docx(filepath):
    """Extract text from a DOCX file using python-docx."""
    from docx import Document
    doc = Document(filepath)
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    return '\n'.join(full_text)


def parse_resume(filepath):
    log("INFO", f"Parsing resume with Gemini: {filepath}")
    
    gemini_client = get_gemini()
    ext = Path(filepath).suffix.lower()
    
    # Handle DOCX/DOC files - extract text locally first
    if ext in [".docx", ".doc"]:
        try:
            raw_text = extract_text_from_docx(filepath)
            log("INFO", f"Extracted {len(raw_text)} chars from {ext} file")
            
            # Use Gemini to clean up and structure the text
            response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"Clean up and format this resume text. Return it in a readable format:\n\n{raw_text}"
            )
            return response.text
        except Exception as e:
            log("ERROR", f"Failed to extract text from {ext}: {e}")
            raise
    
    # Handle PDF files - upload to Gemini
    elif ext == ".pdf":
        uploaded_file = gemini_client.files.upload(file=filepath, config={"mime_type": "application/pdf"})
        
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
    
    else:
        raise ValueError(f"Unsupported file type: {ext}")


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
    sender_email, sender_name = get_sender(gmail, msg_id)
    log("INFO", f"Processing email from {sender_email}...")

    # --- Job Router Logic ---
    subject = get_email_subject(gmail, msg_id)
    job_title = parse_job_title_from_subject(subject)
    
    if not job_title:
        log("ERROR", f"Could not parse job title from subject: '{subject}'")
        return
    
    # Parse candidate name from subject
    name = parse_name_from_subject(subject)
    if not name:
        log("WARN", f"Could not parse name from subject, using sender name: {sender_name}")
        name = sender_name
    
    # --- Extract REAL candidate email from body ---
    # Betterteam emails come from noreply@betterteam.com, but contain the actual email in body
    email_body = get_email_body(gmail, msg_id)
    candidate_email = parse_candidate_email_from_body(email_body)
    
    if candidate_email:
        log("INFO", f"Found candidate email in body: {candidate_email}")
        email = candidate_email
    else:
        # Fallback to sender if we can't find email in body
        log("WARN", f"Could not find candidate email in body, using sender: {sender_email}")
        email = sender_email
    # --- End email extraction ---
    
    job = lookup_job(supabase, job_title)
    
    if not job:
        log("ERROR", f"CRITICAL: Job '{job_title}' not found in DB. Skipping candidate.")
        return
    
    log("INFO", f"Matched job: {job_title} (ID: {job['id']}) | Candidate: {name} <{email}>")
    # --- End Job Router ---

    if candidate_exists(supabase, email):
        log("INFO", f"{email} already exists, skipping")
        mark_as_read(gmail, msg_id)
        return

    filepath = download_resume(gmail, msg_id, name or email)
    if not filepath:
        log("WARN", f"No resume attachment (PDF/DOCX/DOC) for {email}, skipping")
        return

    resume_text = parse_resume(filepath)
    save_candidate(supabase, email, name, resume_text, msg_id, job["id"], job["description"])
    mark_as_read(gmail, msg_id)
    
    # Cleanup downloaded file
    filepath.unlink(missing_ok=True)
    
    log("INFO", f"Saved {name} <{email}> for job: {job_title}")


def run_ingest() -> int:
    """
    Main ingest function - can be called from other modules.
    Returns the number of emails processed.
    """
    log("INFO", "Starting email ingestion...")
    
    gmail = get_gmail_service()
    supabase = get_supabase_client()
    DOWNLOADS_DIR.mkdir(exist_ok=True)

    messages = fetch_unread_emails(gmail)
    log("INFO", f"Found {len(messages)} unread application(s)")

    if not messages:
        return 0

    success, failed = 0, 0
    for msg in messages:
        try:
            process_email(gmail, supabase, msg["id"])
            success += 1
        except Exception as e:
            log("ERROR", f"Failed to process {msg['id']}: {e}")
            failed += 1

    log("INFO", f"Ingestion complete: {success} succeeded, {failed} failed")
    return success


def main():
    """Entry point when run directly."""
    run_ingest()


if __name__ == "__main__":
    main()
