from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import google.generativeai as genai
import os
import copy


notes_route = Blueprint("notes", __name__)

# Get API key from environment instead of hardcoding
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

def summarize_transcript(transcript, max_length=40000):
    """
    Summarize long transcripts to a manageable length using semantic chunking.
    
    Args:
        transcript (str): Original transcript text
        max_length (int): Maximum desired length for the summary
        
    Returns:
        str: Summarized transcript
    """
    if len(transcript) <= max_length:
        return transcript
    
    # Create more specific summary prompt with instructions for preserving key information
    summary_prompt = f"""
    Please provide a comprehensive summary of the following lecture transcript.
    Focus on:
    1. Main concepts, theories, and frameworks
    2. Key definitions and technical terms
    3. Important examples and case studies
    4. Major arguments and conclusions
    
    Transcript:
    {transcript}
    
    Maintain academic tone and preserve technical accuracy while reducing length.
    """
    
    response = model.generate_content(summary_prompt, 
                                     generation_config={"temperature": 0.2})  # Lower temperature for accuracy
    return response.text

def extract_lecture_metadata(transcript):
    """
    Extract key metadata from the lecture transcript to improve context.
    
    Args:
        transcript (str): Lecture transcript text
        
    Returns:
        dict: Dictionary containing metadata about the lecture
    """
    metadata_prompt = f"""
    Extract the following information from this lecture transcript. 
    Return ONLY a JSON object with these fields:
    - subject: The academic subject or discipline
    - level: Academic level (introductory, intermediate, advanced)
    - main_topics: List of 3-5 main topics covered
    - speaker: Name of lecturer if mentioned
    
    Transcript:
    {transcript[:20000]}  # Use beginning of transcript for efficiency
    """
    
    response = model.generate_content(metadata_prompt)
    try:
        # Parse JSON response or return empty dict if parsing fails
        import json
        return json.loads(response.text)
    except:
        return {}

def create_notes_prompt(user_prompt, transcript, last_notes=None, max_prompt_length=8000):
    """
    Create an optimized prompt for Gemini API to generate lecture notes with better
    context awareness and structure.
    
    Args:
        user_prompt (str): User's specific requirements for the notes
        transcript (str): Lecture transcript text
        last_notes (str, optional): Previous version of the notes if it exists
        max_prompt_length (int): Maximum allowed prompt length
        
    Returns:
        str: Formatted prompt string for the API
    """
    # Extract lecture metadata for better context
    metadata = extract_lecture_metadata(transcript)
    
    # Enhanced notes structure with more flexible formatting options
    NOTES_STRUCTURE = """
    Generate the notes in Markdown format with this structure:
    
    # [Descriptive Topic Title]
    
    ## Overview
    [Comprehensive summary of main concepts and learning objectives]
    
    ## Key Concepts
    [Main points with detailed explanations, organized hierarchically]
    
    ## Detailed Explanations
    [In-depth explanations of complex concepts with visual representations where appropriate]
    
    ## Examples & Applications
    [Practical examples showing real-world relevance, including code samples or case studies when applicable]
    
    ## Important Formulas/Definitions
    [Critical formulas, equations, or definitions formatted for easy reference]
    
    ## Summary
    [Concise synthesis of the most important points for review]
    
    ## Further Study
    [Recommended resources including academic citations where available]
    
    Use advanced Markdown formatting:
    - Headers with appropriate hierarchy (##, ###)
    - Bullet and numbered lists for sequential information
    - Code blocks with language specification (```python, ```javascript)
    - Tables for comparative information
    - Bold and italic text for emphasis
    - Blockquotes for important quotes or emphasis
    - Mathematical notation using LaTeX syntax when appropriate
    """

    # Process previous notes if available
    if last_notes:
        # Extract section headers from previous notes for better context
        import re
        headers = re.findall(r'(?m)^#{1,3}\s+(.+)$', last_notes)
        header_summary = "\n".join([f"- {h}" for h in headers[:10]])
        
        # Include a sample of previous content plus the structure
        if len(last_notes) > 25000:
            last_notes_sample = last_notes[:25000] + "\n...[Previous notes truncated]..."
        else:
            last_notes_sample = last_notes
            
        base_prompt = f"""
        Generate comprehensive lecture notes based on the following requirements:
        
        USER REQUIREMENTS:
        {user_prompt}
        
        LECTURE CONTEXT:
        Subject: {metadata.get('subject', 'Not specified')}
        Level: {metadata.get('level', 'Not specified')}
        Main Topics: {', '.join(metadata.get('main_topics', ['Not specified']))}
        Speaker: {metadata.get('speaker', 'Not specified')}
        
        PREVIOUS NOTES STRUCTURE:
        {header_summary}
        
        PREVIOUS NOTES SAMPLE:
        {last_notes_sample}
        
        {NOTES_STRUCTURE}
        
        IMPORTANT INSTRUCTIONS:
        1. Maintain the academic depth and technical accuracy from the previous notes
        2. Incorporate the user's new requirements while preserving valuable content
        3. Improve organization and clarity where possible
        4. Add visual elements (tables, structured lists) to enhance comprehension
        5. Ensure all technical terms are accurately defined
        """
    else:
        # For new notes, use semantic chunking for transcript processing
        if len(transcript) > 40000:
            processed_transcript = summarize_transcript(transcript)
        else:
            processed_transcript = transcript
        
        base_prompt = f"""
        Generate comprehensive academic lecture notes based on the transcript and requirements:
        
        LECTURE CONTEXT:
        Subject: {metadata.get('subject', 'Not specified')}
        Level: {metadata.get('level', 'Not specified')}
        Main Topics: {', '.join(metadata.get('main_topics', ['Not specified']))}
        Speaker: {metadata.get('speaker', 'Not specified')}
        
        USER REQUIREMENTS:
        {user_prompt}
        
        LECTURE TRANSCRIPT:
        {processed_transcript}
        
        {NOTES_STRUCTURE}
        
        IMPORTANT INSTRUCTIONS:
        1. Prioritize accuracy and depth of content over brevity
        2. Include concrete examples that illustrate abstract concepts
        3. Use visual formatting to enhance understanding (tables, lists, etc.)
        4. Define all technical terminology for clarity
        5. Organize content in a logical learning progression
        6. Add references to source material where appropriate
        """
    
    # Apply intelligent prompt optimization
    if len(base_prompt) > max_prompt_length:
        # Calculate how much to trim while preserving key sections
        transcript_section = re.search(r'LECTURE TRANSCRIPT:\s*(.+?)(?=IMPORTANT INSTRUCTIONS|\Z)', base_prompt, re.DOTALL)
        if transcript_section:
            transcript_text = transcript_section.group(1)
            if len(transcript_text) > (len(base_prompt) - max_prompt_length + 200):  # Add buffer
                # Intelligently reduce transcript length
                reduced_length = len(transcript_text) - (len(base_prompt) - max_prompt_length + 200)
                reduced_transcript = transcript_text[:reduced_length] + "\n...[Transcript truncated]..."
                base_prompt = base_prompt.replace(transcript_text, reduced_transcript)
    
    return base_prompt

def generate_notes(user_prompt, transcript, last_notes=None):
    """
    Generate lecture notes with improved quality controls.
    
    Args:
        user_prompt (str): User's specific requirements
        transcript (str): Lecture transcript
        last_notes (str, optional): Previous version of notes
        
    Returns:
        str: Generated notes content
    """
    prompt = create_notes_prompt(user_prompt, transcript, last_notes)
    
    # Use more sophisticated generation parameters
    response = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.3,  # Lower temperature for academic content
            "top_p": 0.85,       # More focused sampling for coherence
            "max_output_tokens": 8192  # Allow for detailed notes
        }
    )
    
    return response.text

def save_notes_history(lecture_id, user_id, notes_content, version_name=None):
    """
    Save a version of notes to the history collection with enhanced metadata
    
    Args:
        lecture_id (str): ID of the lecture
        user_id (str): ID of the user
        notes_content (str): Content of the notes
        version_name (str, optional): Optional user-provided name for this version
        
    Returns:
        str: Version ID of the saved notes
    """
    from app import mongo
    from datetime import datetime
    import hashlib
    
    notes_history_col = mongo.db.notes_history
    
    # Generate content hash for duplicate detection
    content_hash = hashlib.md5(notes_content.encode()).hexdigest()
    
    # Generate version ID with timestamp
    timestamp = datetime.now()
    version_id = f"note_{lecture_id}_{timestamp.strftime('%Y%m%d%H%M%S')}"
    
    # Extract word count and estimated read time
    word_count = len(notes_content.split())
    read_time_mins = round(word_count / 200)  # Assuming 200 words per minute reading speed
    
    # Create enhanced history document
    history_document = {
        "lecture_id": lecture_id,
        "notes_content": notes_content,
        "userId": user_id,
        "created_at": timestamp.isoformat(),
        "version_id": version_id,
        "version_name": version_name,
        "metadata": {
            "word_count": word_count,
            "read_time_mins": read_time_mins,
            "content_hash": content_hash
        }
    }
    
    # Insert into history collection
    notes_history_col.insert_one(history_document)
    
    return version_id

def get_notes_versions(lecture_id, user_id, limit=10):
    """
    Retrieve version history for a specific lecture's notes
    
    Args:
        lecture_id (str): ID of the lecture
        user_id (str): ID of the user
        limit (int): Maximum number of versions to return
        
    Returns:
        list: List of version metadata (without full content)
    """
    from app import mongo
    
    notes_history_col = mongo.db.notes_history
    
    # Find all versions for this lecture and user, sorted by creation date
    versions = notes_history_col.find(
        {"lecture_id": lecture_id, "userId": user_id},
        {"notes_content": 0}  # Exclude full content for efficiency
    ).sort("created_at", -1).limit(limit)
    
    return list(versions)

@notes_route.route("/generate", methods=["POST"])
@jwt_required()
def gen_notes():
    
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        if not current_user:
            return jsonify({
                "error": "Authentication required",
                "message": "Valid JWT token is required for this endpoint"
            }), 401
        user_id = current_user.get('userId') or current_user.get('email')
        
        data = request.get_json()
        user_prompt = data.get("user_prompt")
        last_notes = data.get("last_notes")
        transcript = data.get("transcript")
        lecture_id = data.get("lecture_id")
        
        # Validate required fields
        if not user_prompt or not transcript or not lecture_id:
            return jsonify({
                "error": "Missing required fields",
                "message": "user_prompt, transcript, and lecture_id are required"
            }), 400
        
        # Get the notes collection from the main app's MongoDB connection
        from app import mongo, notes_col, lectures_col
        
        lecture = lectures_col.find_one({"id": lecture_id, "userId": user_id})
        if not lecture:
            return jsonify({"error": "Lecture not found or access denied"}), 404
        
        # Handle very long inputs in chunks if necessary
        if len(transcript) > 12000:  # If transcript is extremely long
            notes_sections = []
            chunk_size = 8000
            for i in range(0, len(transcript), chunk_size):
                chunk = transcript[i:i + chunk_size]
                prompt = create_notes_prompt(user_prompt, chunk)
                response = model.generate_content(prompt)
                notes_sections.append(response.text)
            
            # Combine the sections
            combine_prompt = f"""
            Please combine and organize these note sections into a cohesive document:
            
            {' '.join(notes_sections)}
            """
            final_response = model.generate_content(combine_prompt)
            notes_content = final_response.text
        else:
            prompt = create_notes_prompt(user_prompt, transcript, last_notes)
            response = model.generate_content(prompt)
            notes_content = response.text

        # Create version ID for this new generation
        version_id = f"note_{lecture_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Create notes document with user information
        notes_document = {
            "lecture_id": lecture_id,
            "notes_content": notes_content,
            "userId": user_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "id": f"note_{lecture_id}",  # Unique ID for the notes
            "version_id": version_id     # Add version ID to main document
        }
        
        # Check if notes for this lecture already exist
        existing_notes = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id})
        
        if existing_notes:
            # Always save each generation to history
            save_notes_history(lecture_id, user_id, notes_content)
            
            # Update existing notes
            notes_col.update_one(
                {"lecture_id": lecture_id, "userId": user_id},
                {"$set": {
                    "notes_content": notes_content,
                    "updated_at": datetime.now().isoformat(),
                    "version_id": version_id
                }}
            )
        else:
            # Insert new notes
            notes_col.insert_one(notes_document)
            
            # Also save to history for the first generation
            save_notes_history(lecture_id, user_id, notes_content)

        return jsonify({
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "notes_content": notes_content,
            "id": notes_document["id"],
            "version_id": version_id,
            "metadata": {
                "model_used": "gemini-1.5-flash",
                "processed_length": len(transcript)
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Notes generation failed",
            "message": str(e)
        }), 500

@notes_route.route("/update/<lecture_id>", methods=["PUT"])
@jwt_required()
def update_notes(lecture_id):
    """
    Update existing notes for a specific lecture with direct content.
    This is different from generate as it doesn't use AI to generate content.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        data = request.get_json()
        notes_content = data.get("notes_content")
        version_id = data.get("version_id")  # Allow specifying which version to update
        
        if not notes_content:
            return jsonify({
                "error": "Missing required fields",
                "message": "notes_content is required"
            }), 400
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col, lectures_col, mongo
        notes_history_col = mongo.db.notes_history
        
        # Verify the lecture exists and belongs to the current user
        lecture = lectures_col.find_one({"id": lecture_id, "userId": user_id})
        if not lecture:
            return jsonify({"error": "Lecture not found or access denied"}), 404
        
        # Check if we're updating a specific history version
        if version_id:
            # Find the specific version in history
            history_version = notes_history_col.find_one({
                "lecture_id": lecture_id, 
                "userId": user_id,
                "version_id": version_id
            })
            
            if not history_version:
                return jsonify({"error": "Version not found"}), 404
                
            # Update the history version
            notes_history_col.update_one(
                {"version_id": version_id},
                {"$set": {
                    "notes_content": notes_content,
                    "updated_at": datetime.now().isoformat()
                }}
            )
            
            return jsonify({
                "status": "success",
                "message": "Historical version updated successfully",
                "notes_content": notes_content,
                "version_id": version_id
            }), 200
        
        # Check if notes exist for this lecture in the main collection
        existing_notes = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id})
        
        # Generate a new version ID for this update
        new_version_id = f"note_{lecture_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        if existing_notes:
            # Always save changes to history before updating main version
            save_notes_history(lecture_id, user_id, notes_content)
            
            # Update existing notes
            notes_col.update_one(
                {"lecture_id": lecture_id, "userId": user_id},
                {"$set": {
                    "notes_content": notes_content,
                    "updated_at": datetime.now().isoformat(),
                    "version_id": new_version_id
                }}
            )
            
            return jsonify({
                "status": "success",
                "message": "Notes updated successfully",
                "notes_content": notes_content,
                "updated_at": datetime.now().isoformat(),
                "version_id": new_version_id
            }), 200
        else:
            # Create new notes document
            notes_document = {
                "lecture_id": lecture_id,
                "notes_content": notes_content,
                "userId": user_id,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "id": f"note_{lecture_id}",
                "version_id": new_version_id
            }
            
            notes_col.insert_one(notes_document)
            
            # Save to history as well
            save_notes_history(lecture_id, user_id, notes_content)
            
            return jsonify({
                "status": "success",
                "message": "Notes created successfully",
                "notes_content": notes_content,
                "id": notes_document["id"],
                "version_id": new_version_id
            }), 201
            
    except Exception as e:
        return jsonify({
            "error": "Failed to update notes",
            "message": str(e)
        }), 500
    
@notes_route.route("/get/<lecture_id>", methods=["GET"])
@jwt_required()
def get_notes(lecture_id):
    """
    Retrieve previously generated notes from the database by lecture ID.
    """
        
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col
        
        # Fetch the notes by lecture ID and user ID
        notes_document = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id}, {'_id': 0})

        if not notes_document:
            return jsonify({
                "status": "not_found",
                "message": "No notes found for the given lecture."
            }), 404

        return jsonify({
            "status": "success",
            "notes_content": notes_document.get("notes_content"),
            "created_at": notes_document.get("created_at"),
            "updated_at": notes_document.get("updated_at"),
            "id": notes_document.get("id"),
            "version_id": notes_document.get("version_id")
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Failed to retrieve notes",
            "message": str(e)
        }), 500

@notes_route.route("/history/<lecture_id>", methods=["GET"])
@jwt_required()
def get_notes_history(lecture_id):
    """
    Retrieve history of notes for a specific lecture.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the notes collection from the main app's MongoDB connection
        from app import mongo
        
        # Get the notes_history collection
        notes_history_col = mongo.db.notes_history
        
        # Fetch the notes history by lecture ID and user ID
        history_documents = list(notes_history_col.find(
            {"lecture_id": lecture_id, "userId": user_id},
            {'_id': 0}
        ).sort([("created_at", -1)]))

        # Also fetch the current notes to include in history
        from app import notes_col
        current_notes = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id}, {'_id': 0})
        
        if current_notes:
            # Add a flag to identify this as the current version
            current_notes["is_current"] = True
            current_notes["editable"] = False  # Current version not directly editable
            
            # If there are no history documents but we have current notes
            if not history_documents:
                history_documents = [current_notes]
            else:
                # Check if the current version is different from the latest history version
                if current_notes.get("version_id") != history_documents[0].get("version_id"):
                    history_documents.insert(0, current_notes)
        
        # Add editable flag to all history versions
        for doc in history_documents:
            if not doc.get("is_current"):  # Skip current version which we already marked
                doc["editable"] = True

        if not history_documents:
            return jsonify({
                "status": "not_found",
                "message": "No notes history found for the given lecture."
            }), 404

        return jsonify({
            "status": "success",
            "history": history_documents,
            "count": len(history_documents)
        }), 200

    except Exception as e:
        return jsonify({
            "error": "Failed to retrieve notes history",
            "message": str(e)
        }), 500

@notes_route.route("/delete/<lecture_id>", methods=["DELETE"])
@jwt_required()
def delete_notes(lecture_id):
    """
    Delete notes for a specific lecture.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col
        
        # Get the notes before deleting to archive in history
        existing_notes = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id})
        
        if existing_notes:
            # Save to history before deleting
            save_notes_history(lecture_id, user_id, existing_notes["notes_content"])
        
        # Delete the notes
        result = notes_col.delete_one({"lecture_id": lecture_id, "userId": user_id})
        
        if result.deleted_count == 0:
            return jsonify({
                "status": "not_found",
                "message": "No notes found for the given lecture."
            }), 404

        return jsonify({
            "status": "success",
            "message": "Notes deleted successfully."
        }), 200

    except Exception as e:
        return jsonify({
            "error": "Failed to delete notes",
            "message": str(e)
        }), 500

@notes_route.route("/lecture/<lecture_id>", methods=["GET"])
@jwt_required()
def get_lecture_notes(lecture_id):
    """
    Get all notes associated with a specific lecture ID.
    This can return multiple versions if implemented with versioning.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col
        
        # Find all notes for this lecture (in a production system with versioning)
        notes = list(notes_col.find(
            {"lecture_id": lecture_id, "userId": user_id},
            {'_id': 0}
        ).sort([("updated_at", -1)]))
        
        if not notes:
            return jsonify({
                "status": "not_found",
                "message": "No notes found for the given lecture."
            }), 404
            
        return jsonify({
            "status": "success",
            "notes": notes,
            "count": len(notes)
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": "Failed to retrieve lecture notes",
            "message": str(e)
        }), 500

@notes_route.route("/all", methods=["GET"])
@jwt_required()
def get_all_notes():
    """
    Retrieve all notes for the current user.
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col, lectures_col
        
        # Create a pipeline to join notes with lecture information
        pipeline = [
            {
                "$match": {
                    "userId": user_id
                }
            },
            {
                "$lookup": {
                    "from": "lectures",
                    "localField": "lecture_id",
                    "foreignField": "id",
                    "as": "lecture_info"
                }
            },
            {
                "$unwind": {
                    "path": "$lecture_info",
                    "preserveNullAndEmptyArrays": True
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "id": 1,
                    "lecture_id": 1,
                    "created_at": 1,
                    "updated_at": 1,
                    "version_id": 1,
                    "lecture_title": "$lecture_info.title",
                    "lecture_number": "$lecture_info.lecture_number",
                    "subject_id": "$lecture_info.subject_id"
                }
            }
        ]
        
        notes_list = list(notes_col.aggregate(pipeline))
        
        return jsonify({
            "status": "success",
            "notes": notes_list,
            "count": len(notes_list)
        }), 200

    except Exception as e:
        return jsonify({
            "error": "Failed to retrieve notes",
            "message": str(e)
        }), 500

@notes_route.route("/restore/<lecture_id>/<version_id>", methods=["POST"])
@jwt_required()
def restore_notes_version(lecture_id, version_id):
    """
    Restore a previous version of notes from history to be the current version
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Get the collections from the main app's MongoDB connection
        from app import mongo, notes_col
        notes_history_col = mongo.db.notes_history
        
        # Find the version to restore
        history_version = notes_history_col.find_one({
            "lecture_id": lecture_id, 
            "userId": user_id,
            "version_id": version_id
        })
        
        if not history_version:
            return jsonify({
                "status": "not_found",
                "message": "Notes version not found."
            }), 404
            
        # Create a new version ID for the restored version
        new_version_id = f"note_{lecture_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
        # Get current version of notes to save to history before restoring
        current_notes = notes_col.find_one({"lecture_id": lecture_id, "userId": user_id})
        
        if current_notes:
            # Save current version to history before replacing
            save_notes_history(lecture_id, user_id, current_notes["notes_content"])
            
            # Update with restored version
            notes_col.update_one(
                {"lecture_id": lecture_id, "userId": user_id},
                {"$set": {
                    "notes_content": history_version["notes_content"],
                    "updated_at": datetime.now().isoformat(),
                    "version_id": new_version_id
                }}
            )
        else:
            # Create new notes with restored content
            notes_document = {
                "lecture_id": lecture_id,
                "notes_content": history_version["notes_content"],
                "userId": user_id,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "id": f"note_{lecture_id}",
                "version_id": new_version_id
            }
            
            notes_col.insert_one(notes_document)
            
        return jsonify({
            "status": "success",
            "message": "Notes version restored successfully.",
            "notes_content": history_version["notes_content"],
            "version_id": new_version_id
        }), 200
            
    except Exception as e:
        return jsonify({
            "error": "Failed to restore notes version",
            "message": str(e)
        }), 500

@notes_route.route("/edit/history/<version_id>", methods=["PUT"])
@jwt_required()
def edit_history_version(version_id):
    """
    Edit a specific version in the history collection
    This endpoint allows editing only history versions, not the current version
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        data = request.get_json()
        notes_content = data.get("notes_content")
        
        if not notes_content:
            return jsonify({
                "error": "Missing required fields",
                "message": "notes_content is required"
            }), 400
        
        # Get the collections from the main app's MongoDB connection
        from app import mongo
        notes_history_col = mongo.db.notes_history
        
        # Find the version to edit
        history_version = notes_history_col.find_one({
            "userId": user_id,
            "version_id": version_id
        })
        
        if not history_version:
            return jsonify({
                "status": "not_found",
                "message": "Notes version not found in history."
            }), 404
            
        # Update the history version
        notes_history_col.update_one(
            {"version_id": version_id, "userId": user_id},
            {"$set": {
                "notes_content": notes_content,
                "updated_at": datetime.now().isoformat()
            }}
        )
        
        return jsonify({
            "status": "success",
            "message": "History version updated successfully.",
            "version_id": version_id,
            "notes_content": notes_content
        }), 200
            
    except Exception as e:
        return jsonify({
            "error": "Failed to edit history version",
            "message": str(e)
        }), 500
    

# Add this function for translation using Gemini
def translate_with_gemini(content, target_language):
    """
    Use the Gemini API to translate content to the target language.
    
    Args:
        content (str): The content to translate
        target_language (str): Target language name (e.g., 'Hindi', 'Telugu')
        
    Returns:
        str: Translated content
    """
    try:
        # For very large content, we need to split it
        if len(content) > 30000:
            chunks = [content[i:i+30000] for i in range(0, len(content), 30000)]
            translated_chunks = []
            
            for chunk in chunks:
                prompt = f"""
                Translate the following text to {target_language}. 
                Preserve all formatting, including markdown syntax, code blocks, and special characters.
                
                TEXT TO TRANSLATE:
                {chunk}
                """
                response = model.generate_content(prompt, generation_config={"temperature": 0.1})
                translated_chunks.append(response.text)
            
            return ''.join(translated_chunks)
        else:
            prompt = f"""
            Translate the following text to {target_language}.
            Preserve all formatting, including markdown syntax, code blocks, and special characters.
            
            TEXT TO TRANSLATE:
            {content}
            """
            response = model.generate_content(prompt, generation_config={"temperature": 0.1})
            return response.text
    except Exception as e:
        print(f"Translation error: {str(e)}")
        return content

# Add this new endpoint for translation
@notes_route.route("/translate/<lecture_id>", methods=["POST"])
@jwt_required()
def translate_notes(lecture_id):
    """
    Translate notes to the specified language (English, Hindi, Telugu).
    """
    try:
        # Get current user from JWT token
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
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
        
        # Get the notes collection from the main app's MongoDB connection
        from app import notes_col, mongo
        notes_history_col = mongo.db.notes_history
        
        # Get the specific version if requested
        if version_id:
            notes_document = notes_history_col.find_one({
                "lecture_id": lecture_id, 
                "userId": user_id,
                "version_id": version_id
            })
        else:
            # Otherwise get the current version
            notes_document = notes_col.find_one({
                "lecture_id": lecture_id, 
                "userId": user_id
            })
        
        if not notes_document:
            return jsonify({
                "status": "not_found",
                "message": "No notes found for the given lecture."
            }), 404
        
        # Get the notes content
        notes_content = notes_document.get("notes_content")
        
        # Translate the content using Gemini
        translated_content = translate_with_gemini(notes_content, supported_languages[target_language])
        
        return jsonify({
            "status": "success",
            "translated_content": translated_content,
            "original_content": notes_content,
            "language": target_language,
            "language_name": supported_languages[target_language],
            "version_id": notes_document.get("version_id")
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "Translation failed",
            "message": str(e)
        }), 500

# Add endpoint to list supported languages
@notes_route.route("/supported-languages", methods=["GET"])
def get_supported_languages():
    """
    Get a list of supported languages for translation.
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