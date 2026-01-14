#!/usr/bin/env python3
"""Shared utilities for the recruiting bot - Production Ready for Railway."""

import os
import json
from pathlib import Path

# dotenv is optional - Railway provides env vars directly
try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        pass  # No-op in production
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from supabase import create_client
from google import genai

# Load environment variables (for local dev)
load_dotenv()

# --- Configuration ---
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]

# File paths relative to project root (for local dev fallback)
PROJECT_ROOT = Path(__file__).parent.parent
TOKEN_PATH = PROJECT_ROOT / "token.json"
CREDENTIALS_PATH = PROJECT_ROOT / "credentials.json"

# Environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Production env vars for headless auth
GOOGLE_TOKEN_JSON = os.getenv("GOOGLE_TOKEN_JSON")
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON")


def log(level: str, msg: str):
    """Print a formatted log message."""
    print(f"[{level}] {msg}")


def get_supabase_client():
    """Initialize and return the Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY environment variables")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_gmail_service():
    """
    Authenticate with Gmail and return the service resource.
    
    Production Mode (Railway):
        - Reads GOOGLE_TOKEN_JSON env var for access/refresh tokens
        - Reads GOOGLE_CREDENTIALS_JSON env var for client_id/client_secret (for refresh)
        - Auto-refreshes expired tokens
    
    Local Dev Mode:
        - Falls back to token.json and credentials.json files
        - Can launch browser flow if needed
    """
    creds = None
    client_config = None
    is_production = bool(GOOGLE_TOKEN_JSON)
    
    # --- PRODUCTION MODE: Load from environment variables ---
    if GOOGLE_TOKEN_JSON:
        log("INFO", "Loading Gmail auth from environment variables (production mode)")
        
        try:
            # Parse the token JSON
            token_data = json.loads(GOOGLE_TOKEN_JSON)
            
            # Parse credentials JSON for client_id/client_secret (needed for refresh)
            if GOOGLE_CREDENTIALS_JSON:
                creds_data = json.loads(GOOGLE_CREDENTIALS_JSON)
                # Handle both "installed" and "web" OAuth client types
                client_config = creds_data.get("installed") or creds_data.get("web", {})
            
            # Build credentials with all required fields
            creds = Credentials(
                token=token_data.get("token"),
                refresh_token=token_data.get("refresh_token"),
                token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=client_config.get("client_id") if client_config else token_data.get("client_id"),
                client_secret=client_config.get("client_secret") if client_config else token_data.get("client_secret"),
                scopes=token_data.get("scopes", GMAIL_SCOPES)
            )
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse GOOGLE_TOKEN_JSON: {e}")
    
    # --- LOCAL DEV MODE: Load from files ---
    else:
        log("INFO", "Loading Gmail auth from local files (dev mode)")
        
        if TOKEN_PATH.exists():
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), GMAIL_SCOPES)
    
    # --- REFRESH OR RE-AUTH ---
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            log("INFO", "Token expired, refreshing...")
            try:
                creds.refresh(Request())
                log("INFO", "Token refreshed successfully")
                
                # In local mode, save the refreshed token
                if not is_production and TOKEN_PATH:
                    TOKEN_PATH.write_text(creds.to_json())
                    
            except Exception as e:
                if is_production:
                    raise RuntimeError(f"Token refresh failed in production: {e}. You may need to regenerate GOOGLE_TOKEN_JSON.")
                else:
                    log("WARN", f"Token refresh failed: {e}, will re-authenticate")
                    creds = None
        
        # Only allow browser flow in local dev mode
        if not creds and not is_production:
            if not CREDENTIALS_PATH.exists():
                raise FileNotFoundError(f"credentials.json not found at {CREDENTIALS_PATH}")
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), GMAIL_SCOPES)
            creds = flow.run_local_server(port=0)
            TOKEN_PATH.write_text(creds.to_json())
        elif not creds and is_production:
            raise RuntimeError("No valid credentials in production. Check GOOGLE_TOKEN_JSON and GOOGLE_CREDENTIALS_JSON env vars.")
    
    return build("gmail", "v1", credentials=creds)


def get_gemini_client():
    """Configure and return the Google GenAI client."""
    if not GEMINI_API_KEY:
        raise ValueError("Missing GEMINI_API_KEY environment variable")
    return genai.Client(api_key=GEMINI_API_KEY)
