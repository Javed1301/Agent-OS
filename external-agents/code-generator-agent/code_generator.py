import os
import json
import time
import google.generativeai as genai
import google.api_core.exceptions
from dotenv import load_dotenv

def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())

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

    plan = inputs.get("plan")
    goal = inputs.get("goal", "")

    if not plan:
        raise ValueError("Input 'plan' (list of subtasks) is required.")

    # Support case where plan is stringified json
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except:
            # Fallback to simple split by newline
            plan = [line.strip() for line in plan.split("\n") if line.strip()]

    if not isinstance(plan, list):
        raise ValueError("Input 'plan' must be a list of subtasks.")

    print(f"Starting code generation for plan with {len(plan)} subtasks.", flush=True)

    generated_dir = os.path.join(output_dir, "generated")
    os.makedirs(generated_dir, exist_ok=True)

    files_created = set()
    files_modified = set()

    # Use gemini-3.5-flash
    model = genai.GenerativeModel("gemini-3.5-flash")

    formatted_plan = "\n".join([f"{i+1}. {task}" for i, task in enumerate(plan)])

    for idx, subtask in enumerate(plan):
        # Pace requests to fit free-tier rate limits
        if idx > 0:
            time.sleep(10)

        print(f"Executing subtask {idx+1}/{len(plan)}: '{subtask}'", flush=True)

        # Build workspace context
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

        prompt = f"""You are an expert software developer. Your task is to execute the current subtask of a project plan.
Project Goal: "{goal}"
Complete Plan:
{formatted_plan}

Current Subtask to Execute: "{subtask}"

Here are the files currently in the workspace and their contents:
{json.dumps(context, indent=2)}

Please determine the files to create or modify. You should generate the code for this subtask.
You MUST respond ONLY with a JSON object in this format:
{{
  "operations": [
    {{
      "filepath": "relative/path/to/file",
      "action": "create" or "modify",
      "content": "the complete content of the file"
    }}
  ]
}}
"""

        response = generate_content_with_retry(model, prompt)
        try:
            op_data = parse_json(response.text)
            operations = op_data.get("operations", [])
            
            for op in operations:
                filepath = op.get("filepath")
                action = op.get("action")
                content = op.get("content", "")

                if not filepath or not action:
                    continue

                dest_path = os.path.join(generated_dir, filepath)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)

                is_exist = os.path.exists(dest_path)
                with open(dest_path, "w", encoding="utf-8") as f:
                    f.write(content)

                if is_exist:
                    files_modified.add(filepath)
                    print(f"  Modified file: {filepath}", flush=True)
                else:
                    files_created.add(filepath)
                    print(f"  Created file: {filepath}", flush=True)

        except Exception as e:
            print(f"  Error executing subtask: {e}", flush=True)
            raise e

    print("Code generation completed successfully.", flush=True)

    return {
        "status": "success",
        "files_created": list(files_created),
        "files_modified": list(files_modified),
        "summary": f"Created {len(files_created)} files and modified {len(files_modified)} files."
    }
