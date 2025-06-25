from flask import Blueprint, request, jsonify
import google.generativeai as genai
from datetime import datetime
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import uuid
import json

quiz_route = Blueprint("quiz", __name__)

# Get API key from environment instead of hardcoding
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

def summarize_transcript_for_quiz(transcript, max_length=4000):
    """
    Summarize long transcripts while preserving key testable content.
    
    Args:
        transcript (str): Original transcript text
        max_length (int): Maximum desired length for the summary
        
    Returns:
        str: Summarized transcript focused on quiz-worthy content
    """
    if len(transcript) <= max_length:
        return transcript
        
    summary_prompt = f"""
    Please provide a concise summary of the following lecture transcript, 
    focusing specifically on key facts, concepts, and details that would be 
    appropriate for quiz questions:
    {transcript}
    
    Keep the summary focused on testable content.
    """
    
    response = model.generate_content(summary_prompt)
    return response.text

def create_quiz_prompt(user_prompt, transcript, last_quiz=None, quiz_type="standard", difficulty="medium", max_prompt_length=8000):
    """
    Create an optimized prompt for Gemini API to generate quizzes.
    
    Args:
        user_prompt (str): User's specific requirements for the quiz
        transcript (str): Lecture transcript text
        last_quiz (str, optional): Previous version of the quiz if it exists
        quiz_type (str): Type of quiz to generate (e.g., standard, multiple-choice, etc.)
        difficulty (str): Difficulty level of the quiz (e.g., easy, medium, hard)
        max_prompt_length (int): Maximum allowed prompt length
        
    Returns:
        str: Formatted prompt string for the API
    """
    # Template for the quiz structure (moved to a constant to reduce repetition)
    QUIZ_STRUCTURE = """
    Please generate the quiz in Markdown format with the following structure:
    # Quiz Title
    ## Instructions
    [Instructions for the quiz]
    
    ## Questions
    1. [Question]
       - [ ] Option A
       - [ ] Option B
       - [ ] Option C
       - [ ] Option D
       
    [Include correct answers at the end]
    """

    if last_quiz:
        # For updates, only include relevant sections of previous quiz
        if len(last_quiz) > 2000:
            # Extract questions and answers from previous quiz
            last_quiz = last_quiz[:2000] + "\n...[Previous quiz truncated for brevity]..."
            
        base_prompt = f"""
        Generate a quiz based on the following requirements:
        
        USER REQUIREMENTS:
        {user_prompt}
        
        QUIZ TYPE: {quiz_type}
        DIFFICULTY: {difficulty}
        
        {QUIZ_STRUCTURE}
        
        PREVIOUS QUIZ:
        {last_quiz}
        
        Please create a new version of the quiz that integrates the requirement of the user.
        """
    else:
        # For new quizzes, potentially summarize the transcript
        processed_transcript = summarize_transcript_for_quiz(transcript) if len(transcript) > 4000 else transcript
        
        base_prompt = f"""
        Generate a quiz based on the following lecture transcript and requirements:
        
        LECTURE TRANSCRIPT:
        {processed_transcript}
        
        USER REQUIREMENTS:
        {user_prompt}
        
        QUIZ TYPE: {quiz_type}
        DIFFICULTY: {difficulty}
        
        {QUIZ_STRUCTURE}
        """
    
    # Final length check
    if len(base_prompt) > max_prompt_length:
        base_prompt = base_prompt[:max_prompt_length] + "\n...[Prompt truncated to meet length requirements]..."
    
    return base_prompt


@quiz_route.route("/generate", methods=["POST"])
@jwt_required()
def generate_quiz():
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        data = request.get_json()
        user_prompt = data.get("user_prompt")
        transcript = data.get("transcript")
        last_quiz = data.get("last_notes")  # Matches frontend naming
        lecture_id = data.get("lecture_id")
        
        # Validate required fields
        if not user_prompt:
            return jsonify({
                "error": "Missing required fields",
                "message": "User prompt is required"
            }), 400
        
        # Add new parameters
        quiz_type = data.get("quiz_type", "standard")
        difficulty = data.get("difficulty", "medium")

        # Generate the quiz
        prompt = create_quiz_prompt(user_prompt, transcript, last_quiz, quiz_type=quiz_type, difficulty=difficulty)
        response = model.generate_content(prompt)
        quiz_content = response.text
        
        # Create a quiz document
        quiz_id = str(uuid.uuid4())
        version_id = str(uuid.uuid4())
        quiz_document = {
            "id": quiz_id,
            "version_id": version_id,
            "quiz_content": quiz_content,
            "user_prompt": user_prompt,
            "userId": user_id,
            "created_at": datetime.now().isoformat(),
            "lecture_id": lecture_id,
            "is_current": True,
            "editable": True,
            "quiz_type": quiz_type,
            "difficulty": difficulty
        }
        
        # Save to database
        from app import mongo
        quizzes_col = mongo.db.quizzes
        
        # Check if we need to update existing quiz
        existing_quiz = quizzes_col.find_one({"lecture_id": lecture_id, "userId": user_id})
        if existing_quiz:
            # Set all existing versions to non-current
            quizzes_col.update_many(
                {"lecture_id": lecture_id, "userId": user_id},
                {"$set": {"is_current": False}}
            )
            
            # Update quiz_id to match existing record
            quiz_document["id"] = existing_quiz["id"]
        
        # Insert the new version
        quizzes_col.insert_one(quiz_document)
        
        return jsonify({
            "status": "success",
            "quiz_id": quiz_document["id"],
            "version_id": version_id,
            "quiz_content": quiz_content,
            "timestamp": datetime.now().isoformat(),
            "quiz_type": quiz_type,
            "difficulty": difficulty
        }), 200
        
    except Exception as e:
        import traceback
        return jsonify({
            "error": "Quiz generation failed",
            "message": str(e),
            "traceback": traceback.format_exc()
        }), 500

@quiz_route.route("/get/<lecture_id>", methods=["GET"])
@jwt_required()
def get_quiz(lecture_id):
    """
    Retrieve a generated quiz by lecture ID.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        # Get the quiz from the database (current version only)
        from app import mongo
        quizzes_col = mongo.db.quizzes
        quiz = quizzes_col.find_one(
            {"lecture_id": lecture_id, "userId": user_id, "is_current": True}, 
            {'_id': 0}
        )
        
        if not quiz:
            return jsonify({
                "status": "not_found",
                "message": "Quiz not found."
            }), 404
        
        return jsonify({
            "status": "success",
            "quiz_content": quiz.get("quiz_content", ""),
            "version_id": quiz.get("version_id", ""),
            "created_at": quiz.get("created_at", ""),
            "quiz_type": quiz.get("quiz_type", "standard"),
            "difficulty": quiz.get("difficulty", "medium")
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to retrieve quiz",
            "message": str(e)
        }), 500

@quiz_route.route("/update/<lecture_id>", methods=["PUT"])
@jwt_required()
def update_quiz(lecture_id):
    """
    Update an existing quiz.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        data = request.get_json()
        quiz_content = data.get("quiz_content")
        version_id = data.get("version_id")
        quiz_type = data.get("quiz_type")
        difficulty = data.get("difficulty")
        
        if not quiz_content:
            return jsonify({
                "error": "Missing required fields",
                "message": "Quiz content is required"
            }), 400
        
        from app import mongo
        quizzes_col = mongo.db.quizzes
        
        # Find current quiz
        current_quiz = quizzes_col.find_one(
            {"lecture_id": lecture_id, "userId": user_id, "is_current": True},
            {'_id': 0}
        )
        
        if not current_quiz:
            return jsonify({
                "status": "not_found",
                "message": "Quiz not found."
            }), 404
        
        # Use existing quiz type and difficulty if not provided
        if not quiz_type:
            quiz_type = current_quiz.get("quiz_type", "standard")
        if not difficulty:
            difficulty = current_quiz.get("difficulty", "medium")
        
        # Create a new version
        new_version_id = str(uuid.uuid4())
        new_version = {
            "id": current_quiz["id"],
            "version_id": new_version_id,
            "quiz_content": quiz_content,
            "user_prompt": "Manual edit",
            "userId": user_id,
            "created_at": datetime.now().isoformat(),
            "lecture_id": lecture_id,
            "is_current": True,
            "editable": True,
            "quiz_type": quiz_type,
            "difficulty": difficulty
        }
        
        # Set all existing versions to non-current
        quizzes_col.update_many(
            {"lecture_id": lecture_id, "userId": user_id},
            {"$set": {"is_current": False}}
        )
        
        # Insert the new version
        quizzes_col.insert_one(new_version)
        
        return jsonify({
            "status": "success",
            "message": "Quiz updated successfully",
            "version_id": new_version_id,
            "quiz_type": quiz_type,
            "difficulty": difficulty
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to update quiz",
            "message": str(e)
        }), 500

@quiz_route.route("/delete/<lecture_id>", methods=["DELETE"])
@jwt_required()
def delete_quiz(lecture_id):
    """
    Delete all versions of a quiz for a specific lecture.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        # Delete all versions of the quiz
        from app import mongo
        quizzes_col = mongo.db.quizzes
        result = quizzes_col.delete_many({"lecture_id": lecture_id, "userId": user_id})
        
        if result.deleted_count == 0:
            return jsonify({
                "status": "not_found",
                "message": "Quiz not found."
            }), 404
        
        return jsonify({
            "status": "success",
            "message": "Quiz deleted successfully.",
            "count": result.deleted_count
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to delete quiz",
            "message": str(e)
        }), 500

@quiz_route.route("/history/<lecture_id>", methods=["GET"])
@jwt_required()
def get_quiz_history(lecture_id):
    """
    Retrieve version history for a quiz.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        # Get all versions for this quiz
        from app import mongo
        quizzes_col = mongo.db.quizzes
        history = list(quizzes_col.find(
            {"lecture_id": lecture_id, "userId": user_id},
            {'_id': 0}
        ).sort("created_at", -1))
        
        return jsonify({
            "status": "success",
            "history": history
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to retrieve history",
            "message": str(e)
        }), 500

@quiz_route.route("/restore/<lecture_id>/<version_id>", methods=["POST"])
@jwt_required()
def restore_version(lecture_id, version_id):
    """
    Restore a specific version of a quiz.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        from app import mongo
        quizzes_col = mongo.db.quizzes
        
        # Find the version to restore
        version_to_restore = quizzes_col.find_one(
            {"lecture_id": lecture_id, "userId": user_id, "version_id": version_id},
            {'_id': 0}
        )
        
        if not version_to_restore:
            return jsonify({
                "status": "not_found",
                "message": "Version not found."
            }), 404
        
        # Set all versions to non-current
        quizzes_col.update_many(
            {"lecture_id": lecture_id, "userId": user_id},
            {"$set": {"is_current": False}}
        )
        
        # Create a new version based on the restored content
        new_version_id = str(uuid.uuid4())
        new_version = {
            "id": version_to_restore["id"],
            "version_id": new_version_id,
            "quiz_content": version_to_restore["quiz_content"],
            "user_prompt": f"Restored from version {version_id}",
            "userId": user_id,
            "created_at": datetime.now().isoformat(),
            "lecture_id": lecture_id,
            "is_current": True,
            "editable": True,
            "quiz_type": version_to_restore.get("quiz_type", "standard"),
            "difficulty": version_to_restore.get("difficulty", "medium")
        }
        
        # Insert the new version
        quizzes_col.insert_one(new_version)
        
        return jsonify({
            "status": "success",
            "message": "Version restored successfully",
            "quiz_content": version_to_restore["quiz_content"],
            "version_id": new_version_id,
            "quiz_type": new_version["quiz_type"],
            "difficulty": new_version["difficulty"]
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to restore version",
            "message": str(e)
        }), 500
    


# Add this function for translating quiz content
def translate_quiz_with_gemini(content, target_language):
    """
    Use the Gemini API to translate quiz content to the target language.
    
    Args:
        content (str): The quiz content to translate
        target_language (str): Target language name (e.g., 'Hindi', 'Telugu')
        
    Returns:
        str: Translated quiz content
    """
    try:
        # For very large content, we need to split it
        if len(content) > 30000:
            chunks = [content[i:i+30000] for i in range(0, len(content), 30000)]
            translated_chunks = []
            
            for chunk in chunks:
                prompt = f"""
                Translate the following quiz content to {target_language}. 
                Preserve all formatting, including markdown syntax, quiz structure, options, and correct answers.
                Make sure all multiple-choice options are correctly labeled and maintain the same meaning.
                
                QUIZ TO TRANSLATE:
                {chunk}
                """
                response = model.generate_content(prompt, generation_config={"temperature": 0.1})
                translated_chunks.append(response.text)
            
            return ''.join(translated_chunks)
        else:
            prompt = f"""
            Translate the following quiz content to {target_language}.
            Preserve all formatting, including markdown syntax, quiz structure, options, and correct answers.
            Make sure all multiple-choice options are correctly labeled and maintain the same meaning.
            
            QUIZ TO TRANSLATE:
            {content}
            """
            response = model.generate_content(prompt, generation_config={"temperature": 0.1})
            return response.text
    except Exception as e:
        print(f"Quiz translation error: {str(e)}")
        return content

# Add this new endpoint for quiz translation
@quiz_route.route("/translate/<lecture_id>", methods=["POST"])
@jwt_required()
def translate_quiz(lecture_id):
    """
    Translate quiz to the specified language (English, Hindi, Telugu).
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('id') or current_user.get('email')
        
        data = request.get_json()
        target_language = data.get("language", "en")  # Default to English
        version_id = data.get("version_id")  # Optional: specific version to translate
        
        # Validate language code
        supported_languages = {
            "en": "English",
            "hi": "Hindi",
            "te": "Telugu"
        }
        
        if target_language not in supported_languages:
            return jsonify({
                "error": "Unsupported language",
                "message": f"Supported languages are: {', '.join(supported_languages.values())}"
            }), 400
        
        # Get the quizzes collection
        from app import mongo
        quizzes_col = mongo.db.quizzes
        
        # Get the specific version if requested
        if version_id:
            quiz_document = quizzes_col.find_one({
                "lecture_id": lecture_id, 
                "userId": user_id,
                "version_id": version_id
            }, {'_id': 0})
        else:
            # Otherwise get the current version
            quiz_document = quizzes_col.find_one({
                "lecture_id": lecture_id, 
                "userId": user_id,
                "is_current": True
            }, {'_id': 0})
        
        if not quiz_document:
            return jsonify({
                "status": "not_found",
                "message": "No quiz found for the given lecture."
            }), 404
        
        # Get the quiz content
        quiz_content = quiz_document.get("quiz_content")
        
        # Translate the content using Gemini
        translated_content = translate_quiz_with_gemini(quiz_content, supported_languages[target_language])
        
        # Create a new version with translated content
        new_version_id = str(uuid.uuid4())
        new_version = {
            "id": quiz_document["id"],
            "version_id": new_version_id,
            "quiz_content": translated_content,
            "user_prompt": f"Translated to {supported_languages[target_language]}",
            "userId": user_id,
            "created_at": datetime.now().isoformat(),
            "lecture_id": lecture_id,
            "is_current": False,  # Don't make it current by default
            "editable": True,
            "quiz_type": quiz_document.get("quiz_type", "standard"),
            "difficulty": quiz_document.get("difficulty", "medium"),
            "language": target_language,
            "language_name": supported_languages[target_language],
            "translated_from": quiz_document.get("version_id")
        }
        
        # Insert the new version
        quizzes_col.insert_one(new_version)
        
        return jsonify({
            "status": "success",
            "translated_content": translated_content,
            "original_content": quiz_content,
            "language": target_language,
            "language_name": supported_languages[target_language],
            "version_id": new_version_id,
            "quiz_type": new_version["quiz_type"],
            "difficulty": new_version["difficulty"]
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Quiz translation failed",
            "message": str(e)
        }), 500

# Update the supported languages endpoint to be used for both notes and quizzes
@quiz_route.route("/supported-languages", methods=["GET"])
def get_quiz_supported_languages():
    """
    Get a list of supported languages for quiz translation.
    """
    supported_languages = {
        "en": "English",
        "hi": "Hindi",
        "te": "Telugu"
    }
    
    return jsonify({
        "status": "success",
        "supported_languages": supported_languages
    }), 200