import json
import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import ServerError


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY not found in .env file"
    )


# =========================================================
# GEMINI CLIENT
# =========================================================

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# GEMINI MODEL
# =========================================================

GEMINI_MODEL = "gemini-3.8-flash"


# =========================================================
# JSON SERIALIZATION
# =========================================================

def make_json_serializable(obj):
    """
    Convert NumPy/PyTorch values into standard
    Python types so the data can safely be
    converted into JSON.
    """

    # NumPy/PyTorch scalar
    if hasattr(obj, "item"):
        return obj.item()

    # Dictionary
    if isinstance(obj, dict):
        return {
            str(key): make_json_serializable(value)
            for key, value in obj.items()
        }

    # List
    if isinstance(obj, list):
        return [
            make_json_serializable(value)
            for value in obj
        ]

    # Tuple
    if isinstance(obj, tuple):
        return [
            make_json_serializable(value)
            for value in obj
        ]

    return obj


# =========================================================
# GEMINI UI/UX REVIEW
# =========================================================

def review_ui(merged_result):
    """
    Send the merged UI analysis to Gemini
    and generate a structured UI/UX design review.
    """

    # -----------------------------------------------------
    # Convert analysis results into JSON-safe data
    # -----------------------------------------------------

    safe_result = make_json_serializable(
        merged_result
    )

    # -----------------------------------------------------
    # Gemini Prompt
    # -----------------------------------------------------

    prompt = f"""
You are an expert UI/UX design reviewer.

Analyze the uploaded UI using ONLY the analysis
results provided below.

Consider:

1. Visual hierarchy
2. Layout and spacing
3. Typography
4. Color and contrast
5. Buttons and interactive elements
6. Forms and input fields
7. Accessibility
8. Overall usability
9. Visual consistency
10. Specific improvements

Important rules:

- Do not invent UI elements.
- Use YOLO detections to understand UI components.
- Use OCR to understand visible text.
- Use CLIP to understand visual style.
- Use accessibility results for accessibility findings.
- Give practical and specific recommendations.
- Do not make claims that are not supported by the analysis.
- Return ONLY valid JSON.
- Do not use Markdown.
- Do not put ```json around the response.

Return exactly this structure:

{{
    "overall_score": 0,

    "summary": "Short UI/UX summary",

    "strengths": [
        "Strength 1",
        "Strength 2",
        "Strength 3"
    ],

    "issues": [
        "Issue 1",
        "Issue 2",
        "Issue 3"
    ],

    "accessibility": [
        "Accessibility finding 1",
        "Accessibility finding 2"
    ],

    "recommendations": [
        "Recommendation 1",
        "Recommendation 2",
        "Recommendation 3"
    ]
}}

Rules for the response:

- overall_score must be an integer from 0 to 100.
- summary must be a short paragraph.
- strengths must be a JSON array of strings.
- issues must be a JSON array of strings.
- accessibility must be a JSON array of strings.
- recommendations must be a JSON array of strings.
- Return valid JSON only.

Analysis Data:

{json.dumps(
    safe_result,
    indent=2
)}
"""

    # -----------------------------------------------------
    # Call Gemini with retry handling
    # -----------------------------------------------------

    print("Sending UI analysis to Gemini...")
    print(f"Gemini model: {GEMINI_MODEL}")

    response = None

    max_retries = 3

    for attempt in range(max_retries):

        try:

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(
                        timeout=30000
                    )
                )
            )

            # Success
            break

        except ServerError as error:

            print(
                f"\nGemini server error "
                f"(attempt {attempt + 1}/{max_retries})"
            )

            print(error)

            # If this was the final attempt,
            # allow the error to reach the pipeline.
            if attempt == max_retries - 1:

                print(
                    "Gemini failed after all retry attempts."
                )

                raise

            # Exponential backoff
            wait_time = 5 * (2 ** attempt)

            print(
                f"Retrying Gemini in "
                f"{wait_time} seconds..."
            )

            time.sleep(wait_time)

    # -----------------------------------------------------
    # Validate Gemini response
    # -----------------------------------------------------

    if response is None:
        raise ValueError(
            "Gemini did not return a response."
        )

    if not response.text:
        raise ValueError(
            "Gemini returned an empty response."
        )

    response_text = response.text.strip()

    print("Gemini response received.")

    # -----------------------------------------------------
    # Remove accidental Markdown code fences
    # -----------------------------------------------------

    if response_text.startswith("```"):

        response_text = (
            response_text
            .replace("```json", "")
            .replace("```JSON", "")
            .replace("```", "")
            .strip()
        )

    # -----------------------------------------------------
    # Convert response into Python dictionary
    # -----------------------------------------------------

    try:

        review = json.loads(
            response_text
        )

    except json.JSONDecodeError as error:

        print("\n================================")
        print("GEMINI INVALID JSON")
        print("================================")

        print(response_text)

        raise ValueError(
            "Gemini did not return valid JSON."
        ) from error

    # -----------------------------------------------------
    # Validate required fields
    # -----------------------------------------------------

    required_fields = [
        "overall_score",
        "summary",
        "strengths",
        "issues",
        "accessibility",
        "recommendations"
    ]

    for field in required_fields:

        if field not in review:

            raise ValueError(
                f"Gemini response is missing "
                f"required field: {field}"
            )

    # -----------------------------------------------------
    # Validate score
    # -----------------------------------------------------

    try:

        review["overall_score"] = int(
            review["overall_score"]
        )

    except (TypeError, ValueError) as error:

        raise ValueError(
            "Gemini returned an invalid overall_score."
        ) from error

    if not 0 <= review["overall_score"] <= 100:

        raise ValueError(
            "Gemini overall_score must be between 0 and 100."
        )

    # -----------------------------------------------------
    # Ensure list fields are lists
    # -----------------------------------------------------

    list_fields = [
        "strengths",
        "issues",
        "accessibility",
        "recommendations"
    ]

    for field in list_fields:

        if not isinstance(review[field], list):

            raise ValueError(
                f"Gemini field '{field}' "
                f"must be a list."
            )

    # -----------------------------------------------------
    # Final Gemini review
    # -----------------------------------------------------

    print(
        f"Gemini UI/UX score: "
        f"{review['overall_score']}/100"
    )

    return review