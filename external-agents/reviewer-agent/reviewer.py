import os
import json
import time
import google.generativeai as genai
import google.api_core.exceptions
from dotenv import load_dotenv

def generate_content_with_retry(model, prompt, retries=5, delay=6) -> any:
    for i in range(retries):
        try:
            return model.generate_content(prompt)
        except google.api_core.exceptions.ResourceExhausted as e:
            if i == retries - 1:
                raise e
            print(f"  Rate limit hit (429). Retrying in {delay} seconds...", flush=True)
            time.sleep(delay)
            delay *= 2
        except Exception as e:
            raise e

def run(inputs: dict, output_dir: str) -> dict:
    # 1. Load environment variables
    load_dotenv()
    
    # Sibling fallback
    if not os.getenv("GEMINI_API_KEY"):
        sibling_env = "D:/Javed/outskill/outskill/.env"
        if os.path.exists(sibling_env):
            load_dotenv(sibling_env)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")

    genai.configure(api_key=api_key)

    generated_dir = inputs.get("files")
    if not generated_dir:
        raise ValueError("Input 'files' (path to generated files directory) is required.")

    if not os.path.exists(generated_dir):
        raise ValueError(f"Generated directory does not exist: {generated_dir}")

    print(f"Starting review of generated files in: {generated_dir}", flush=True)

    # Gather generated files and contents
    context = {}
    for root, dirs, filenames in os.walk(generated_dir):
        for filename in filenames:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, generated_dir)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    context[rel_path] = f.read()
            except Exception:
                pass

    if not context:
        print("No files found to review.", flush=True)
        review_content = "# Code Review Report\n\nNo generated files were found in the workspace to review."
    else:
        # Use gemini-3.5-flash
        model = genai.GenerativeModel("gemini-3.5-flash")

        prompt = f"""You are a senior code reviewer. You are reviewing the following files in the project workspace:
{json.dumps(context, indent=2)}

Please inspect these files carefully.
1. Check for obvious bugs, syntax errors, or logical issues.
2. Check for missing files or incomplete implementations (e.g. if one file imports another, does it exist and is it complete?).
3. Check if all requirements and standard files (like README.md, requirements.txt) are complete and correct.
Provide your final verdict and a detailed review report in Markdown format.

Your response MUST be ONLY the markdown review report, with a clear verdict (e.g., PASSED or FAILED) at the top.
"""
        response = generate_content_with_retry(model, prompt)
        review_content = response.text.strip()

    # Write review.md in output_dir
    os.makedirs(output_dir, exist_ok=True)
    review_path = os.path.join(output_dir, "review.md")
    with open(review_path, "w", encoding="utf-8") as f:
        f.write(review_content)

    print("Review completed successfully. Written review.md.", flush=True)

    return {
        "status": "success",
        "passed": "PASSED" in review_content.upper(),
        "report": review_content
    }
