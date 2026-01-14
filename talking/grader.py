#!/usr/bin/env python3
"""The Brain: Scores candidates against the job description using Gemini."""

import json
from utils import get_supabase_client, get_gemini_client, log

# --- Configuration ---
# Note: JOB_DESCRIPTION is now fetched from the candidates table (job_description column)
# This fallback is only used if job_description is missing

GRADING_PROMPT = """You are a strict hiring manager evaluating candidates.

JOB DESCRIPTION:
{job_description}

CANDIDATE RESUME:
{resume_text}

Rate this candidate from 0-100 based on how well they match the job description.
Be strict in your evaluation. Only give high scores (80+) to truly exceptional matches.

Return ONLY a valid JSON object in this exact format, nothing else:
{{"score": <integer 0-100>, "reasoning": "<one sentence explanation>"}}"""


def fetch_ungraded_candidates(supabase):
    """Fetch candidates with status NEW_APPLICATION."""
    result = (
        supabase.table("candidates")
        .select("id, email, full_name, resume_text, job_description, metadata")
        .eq("status", "NEW_APPLICATION")
        .execute()
    )
    return result.data


def grade_candidate(gemini_client, resume_text: str, job_description: str) -> dict:
    """Use Gemini to score the candidate against the job description."""
    prompt = GRADING_PROMPT.format(
        job_description=job_description,
        resume_text=resume_text
    )
    
    # Use JSON mode for guaranteed valid JSON output
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
        }
    )
    
    # With JSON mode, response is guaranteed valid JSON
    response_text = response.text.strip()
    
    try:
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        # Fallback: try to extract score with regex if JSON parsing fails
        import re
        score_match = re.search(r'"score"\s*:\s*(\d+)', response_text)
        reasoning_match = re.search(r'"reasoning"\s*:\s*"([^"]+)"', response_text)
        
        if score_match:
            return {
                "score": int(score_match.group(1)),
                "reasoning": reasoning_match.group(1) if reasoning_match else "Score extracted from malformed response"
            }
        raise e  # Re-raise if we can't extract anything


def update_candidate_grade(supabase, candidate_id: int, score: int, reasoning: str, existing_metadata: dict):
    """Update the candidate's grade in Supabase."""
    # Merge reasoning into existing metadata
    updated_metadata = existing_metadata or {}
    updated_metadata["grading_reasoning"] = reasoning
    
    supabase.table("candidates").update({
        "jd_match_score": score,
        "status": "GRADED",
        "metadata": updated_metadata
    }).eq("id", candidate_id).execute()


def run_grader() -> int:
    """
    Main grader function - can be called from other modules.
    Returns the number of candidates graded.
    """
    log("INFO", "Starting candidate grading...")
    
    supabase = get_supabase_client()
    gemini_client = get_gemini_client()
    
    candidates = fetch_ungraded_candidates(supabase)
    log("INFO", f"Found {len(candidates)} candidate(s) to grade")
    
    if not candidates:
        log("INFO", "No candidates to grade")
        return 0
    
    success, failed = 0, 0
    
    for candidate in candidates:
        try:
            email = candidate["email"]
            resume_text = candidate.get("resume_text", "")
            job_description = candidate.get("job_description", "General software engineering position")
            
            if not resume_text:
                log("WARN", f"No resume text for {email}, skipping")
                continue
            
            log("INFO", f"Grading {email}...")
            
            result = grade_candidate(gemini_client, resume_text, job_description)
            score = result.get("score", 0)
            reasoning = result.get("reasoning", "No reasoning provided")
            
            update_candidate_grade(
                supabase,
                candidate["id"],
                score,
                reasoning,
                candidate.get("metadata", {})
            )
            
            log("INFO", f"Graded {email}: {score}/100")
            success += 1
            
        except Exception as e:
            log("ERROR", f"Failed to grade {candidate.get('email', 'unknown')}: {e}")
            failed += 1
    
    log("INFO", f"Grading complete: {success} succeeded, {failed} failed")
    return success


def main():
    """Entry point when run directly."""
    run_grader()


if __name__ == "__main__":
    main()
