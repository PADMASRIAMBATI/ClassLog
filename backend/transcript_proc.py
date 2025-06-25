from flask import Blueprint, request, jsonify, Response, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import cv2
import ast
import torch
import json
import whisper
from collections import defaultdict
from inference_sdk import InferenceHTTPClient
from torchvision import transforms
from dotenv import load_dotenv
import multiprocessing
from flask_cors import CORS
from pydub import AudioSegment
from pydub.utils import make_chunks
from moviepy.editor import VideoFileClip
from concurrent.futures import ProcessPoolExecutor
import google.generativeai as genai
from google.generativeai.types import RequestOptions
from google.api_core import retry
from pymongo import MongoClient
from bson.json_util import dumps
from bson.objectid import ObjectId
import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import tempfile
from bson.json_util import dumps


# Ensure multiprocessing compatibility
if multiprocessing.get_start_method(allow_none=True) != 'spawn':
    multiprocessing.set_start_method('spawn')

load_dotenv()

# After this line:
video_processing_bp = Blueprint("video_processing", __name__)

# Add MongoDB connection
# Connect to MongoDB
mongo_uri = os.getenv("MONGO_URI")
mongo_client = MongoClient(mongo_uri)
db = mongo_client.get_default_database()

# Initialize MongoDB collections
transcripts_collection = db.transcripts
results_collection = db.results
processing_status_collection = db.processing_status
translations_collection = db.translations  # New collection for storing translations

# Initialize Roboflow client
robo_key = os.getenv("ROBOFLOW_KEY")

CLIENT = InferenceHTTPClient(
    api_url="https://detect.roboflow.com",
    api_key=robo_key
)

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
PROCESSED_FOLDER = 'processed'

# Ensure upload and processed folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

# Define transformations if required by the model
transform = transforms.Compose([
    transforms.ToTensor(),
])

# Configure Gemini API
gemini_api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=gemini_api_key)

gemini_model = genai.GenerativeModel("gemini-1.5-flash")

# Supported languages
SUPPORTED_LANGUAGES = ["english", "hindi", "telugu"]

def extract_audio(video_path, audio_path="output_audio.mp3"):
    """
    Extracts audio from a video file and saves it as an MP3 file.
    """
    print(f"Extracting audio from {video_path}...")
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(audio_path)
    clip.close()
    print(f"Audio saved to {audio_path}")
    return audio_path


def split_audio(audio_path, output_dir="chunks", chunk_duration=600):
    """
    Splits the audio file into smaller chunks of a specified duration.
    """
    print(f"Splitting audio into chunks of {chunk_duration} seconds...")
    os.makedirs(output_dir, exist_ok=True)

    print(f"File exists: {os.path.exists(audio_path)}")
    audio = AudioSegment.from_file(audio_path)
    chunks = make_chunks(audio, chunk_duration * 1000)  # chunk_duration in milliseconds

    chunk_paths = []
    for i, chunk in enumerate(chunks):
        chunk_path = os.path.join(output_dir, f"chunk_{i}.mp3")
        chunk.export(chunk_path, format="mp3")
        chunk_paths.append(chunk_path)

    print(f"Audio split into {len(chunk_paths)} chunks.")
    return chunk_paths


def transcribe_chunk_with_timestamps(chunk_path, model_name="base"):
    """
    Transcribes an audio chunk using Whisper model with timestamps.
    """
    print(f"Transcribing {chunk_path}...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model(model_name).to(device)
    result = model.transcribe(chunk_path)
    chunk_number = int(chunk_path.rsplit('_', 1)[-1].rsplit('.',1)[0])
    print(f"Chunk number {chunk_number}")

    segments = []
    for segment in result['segments']:
        segments.append({
            "start": (chunk_number*600)+segment['start'],
            "end": (chunk_number*600)+segment['end'],
            "text": segment['text']
        })

    print(f"Completed transcription for {chunk_path}")
    return segments


def transcribe_audio_chunks_with_timestamps(chunk_paths, model="base", use_gpu=False):
    """
    Transcribes multiple audio chunks with timestamps using parallel processing.
    """
    print("Starting transcription of audio chunks with timestamps...")
    transcripts = []
    with ProcessPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(transcribe_chunk_with_timestamps, chunk, model_name=model) for chunk in chunk_paths]
        for future in futures:
            transcripts.extend(future.result())
    return transcripts


def save_transcripts_with_timestamps(transcripts, lecture_id, user_id):
    """
    Saves transcripts with timestamps to the database.
    """
    print(f"Saving transcripts with timestamps to DB...")
    
    plain_transcript = "\n".join([segment["text"] for segment in transcripts])

    json_transcript = [
        {
            "text": segment["text"],
            "start": segment["start"],
            "end": segment["end"]
        }
        for segment in transcripts
    ]

    # Save transcripts in MongoDB with user ID
    transcripts_collection.update_one(
        {"lecture_id": lecture_id, "user_id": user_id},
        {"$set": {
            "lecture_id": lecture_id,
            "user_id": user_id,
            "json_transcript": json_transcript,
            "plain_transcript": plain_transcript
            }
        },
        upsert=True
    )
    print(f"Transcript saved to DB for user {user_id}")
    return plain_transcript


def stream_transcripts(lecture_id, user_id, language="english"):
    """
    Streams a large transcript file in chunks to the client, with optional translation.
    """
    # If English is requested, get the original transcript
    if language.lower() == "english":
        record = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id}, {"_id": 0})   
        if not record:
            return Response("Transcript not found", status=404, content_type="text/plain")
        file_contents = record.get("plain_transcript", "")
    else:
        # Check if translation exists
        translation = translations_collection.find_one({
            "lecture_id": lecture_id, 
            "user_id": user_id,
            "language": language.lower()
        })
        
        if translation:
            file_contents = translation.get("translated_text", "")
        else:
            # Get original transcript for translation
            record = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id}, {"_id": 0})
            if not record:
                return Response("Transcript not found", status=404, content_type="text/plain")
            
            # Translate the transcript
            original_text = record.get("plain_transcript", "")
            translated_text = translate_text(original_text, language.capitalize())
            
            # Save the translation
            translations_collection.insert_one({
                "lecture_id": lecture_id,
                "user_id": user_id,
                "language": language.lower(),
                "translated_text": translated_text
            })
            
            file_contents = translated_text

    def generate():
        for i in range(0, len(file_contents), 1024):
            yield file_contents[i:i+1024]
    return Response(generate(), content_type="text/plain")


def process_frame(frame):
    """
    Process a single frame for hand raise detection.
    """
    input_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    print('Fetching results from API')
    result = CLIENT.infer(input_frame, model_id="hand-raise-v1m/20")
    print('Retrieved the results')

    hand_raised_count = 0
    for boxes in result['predictions']:
        if boxes['class_id'] == 0:
            hand_raised_count += 1

    return hand_raised_count


def process_video(video_path, lecture_id, user_id):
    """
    Processes the video to detect raised hands and analyze question responses.
    """
    print('Processing video...')
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception(f"Failed to open video file: {video_path}")
    
    total_students = 40    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)  # Frames per second
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Initialize result dictionaries
    question_results = defaultdict(lambda: {'yes': 0, 'no': 0, 'not_answered': total_students})
    questions_for_revision = []
    questions_completed = []

    quiz_locs = analyze_transcript(lecture_id, user_id)

    # Process each question and timestamp range
    for question_data in quiz_locs["questions"]:
        for question, (start_time, end_time) in question_data.items():
            start_frame = int(fps * start_time)
            end_frame = int(fps * end_time)

            yes_count, no_count = 0, 0

            for frame_index in range(start_frame, end_frame + 1):
                if 0 <= frame_index < total_frames:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                    ret, frame = cap.read()
                    if not ret:
                        break

                    # Process frame to detect hand raises
                    hand_raised_count = process_frame(frame)
                    yes_count += hand_raised_count
                    no_count += total_students - hand_raised_count

            # Adjust not_answered based on detected responses
            not_answered = max(0, total_students - yes_count - no_count)
            question_results[question] = {
                "yes": yes_count,
                "no": no_count,
                "not_answered": not_answered
            }

            # Determine correct answer using Gemini
            correct_ans_res = gemini_model.generate_content([str(question), """Give me 1 word answer whether the correct answer to this question
             is either yes or no. Do not return anything else, just that single word.

                Example,
                    'Is capital of Italy Rome?'

                    Return: yes (one word yes or no)

                    Return: str 

             """], request_options=RequestOptions(retry=retry.Retry(initial=10, multiplier=2, maximum=60, timeout=300)))
            correct_ans = str(correct_ans_res.text)

            # Categorize question
            if correct_ans.lower() == "yes":
                if yes_count / total_students >= 0.7:  # Example threshold for completion
                    questions_completed.append(question)
                else:
                    questions_for_revision.append(question)
            else:
                if no_count / total_students >= 0.7:  # Example threshold for completion
                    questions_completed.append(question)
                else:
                    questions_for_revision.append(question)

    cap.release()
    
    # Get topics for completed questions
    if questions_completed:
        res_ques_complete = gemini_model.generate_content([str(questions_completed), """Give me the 2, 3 or 4 topics relating to each question in a list format
                For example, 
                    ['Does supervised learning have ouput labels?', 'Is capital of Greece Aethens?']

                    Should return: ['Machine Learning', 'Artificial Intelligence', 'General Knowledge', 'Geography']

                    Just give a list and do not print anything else. Donot take example for their factual accuracy, but just for formatting.
                Return: List(str)

            """], request_options=RequestOptions(retry=retry.Retry(initial=10, multiplier=2, maximum=60, timeout=300)))
        topics_completed = res_ques_complete.text
        topics_completed = ast.literal_eval(topics_completed.strip())
    else:
        topics_completed = []
    
    # Get topics for revision questions
    if questions_for_revision:
        res_ques_revision = gemini_model.generate_content([str(questions_for_revision), """Give me the 3 or 4 topics relating to the question in a list format
                For example, 
                    ['Does supervised learning have ouput labels?', 'Is capital of Greece Aethens?']

                    Should return: ['Machine Learning', 'Artificial Intelligence', 'General Knowledge', 'Geography']

                    Just give a list and do not print anything else. Donot take example for their factual accuracy, but just for formatting.

                    Return: List(str)
            """], request_options=RequestOptions(retry=retry.Retry(initial=10, multiplier=2, maximum=60, timeout=300)))
        topics_for_revision = res_ques_revision.text
        topics_for_revision = ast.literal_eval(topics_for_revision.strip())
    else:
        topics_for_revision = []

    # Save processing results in MongoDB
    results_collection.update_one(
        {"lecture_id": lecture_id, "user_id": user_id},
        {
            "$set": {
                "lecture_id": lecture_id,
                "user_id": user_id,
                "question_results": question_results,
                "questions_completed": questions_completed,
                "questions_for_revision": questions_for_revision,
                "topics_completed": topics_completed,
                "topics_for_revision": topics_for_revision,
            }
        },
        upsert=True
    )

    print('Video processing completed.')
    return True

def translate_text(text, target_language):
    """
    Translates text to the specified language using Gemini.
    """
    print(f"Translating text to {target_language}...")
    
    # For large texts, split into chunks to avoid exceeding Gemini's input limits
    max_chunk_size = 10000  # Adjust based on Gemini's actual limits
    chunks = [text[i:i+max_chunk_size] for i in range(0, len(text), max_chunk_size)]
    translated_chunks = []
    
    for chunk in chunks:
        prompt = f"""Translate the following text to {target_language}:
        
        {chunk}
        
        Return only the translated text without any explanations or additional content.
        """
        
        response = gemini_model.generate_content(
            prompt,
            request_options=RequestOptions(retry=retry.Retry(initial=10, multiplier=2, maximum=60, timeout=300))
        )
        
        translated_chunks.append(response.text.strip())
    
    # Combine all translated chunks
    translated_text = "\n".join(translated_chunks)
    
    # Ensure proper encoding for Telugu
    if target_language.lower() == "telugu":
        translated_text = translated_text.encode('utf-8').decode('utf-8')
    
    return translated_text

def create_pdf(text, title="Transcript"):
    """
    Creates a PDF document from the provided text.
    """
    # Create a temp file to ensure proper PDF handling
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
        temp_path = temp_file.name
        
    # Create the PDF with reportlab
    doc = SimpleDocTemplate(temp_path, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Create content
    content = []
    
    # Add title
    content.append(Paragraph(title, styles['Title']))
    content.append(Spacer(1, 12))
    
    # Add transcript text - split by paragraphs for better formatting
    paragraphs = text.split('\n')
    for para in paragraphs:
        if para.strip():  # Skip empty paragraphs
            content.append(Paragraph(para, styles['Normal']))
            content.append(Spacer(1, 6))
    
    # Build PDF
    doc.build(content)
    
    # Return the file as a BytesIO object for Flask
    with open(temp_path, 'rb') as file:
        buffer = io.BytesIO(file.read())
    
    # Clean up temp file
    os.unlink(temp_path)
    
    # Reset buffer position to beginning
    buffer.seek(0)
    return buffer


@video_processing_bp.route("/transcript/<lecture_id>/download", methods=["GET"])
@jwt_required()
def download_transcript(lecture_id):
    """
    Endpoint to download the transcript as a PDF in English only.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    # Get transcript in English
    transcript_record = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id})
    if not transcript_record:
        return jsonify({"error": "Transcript not found"}), 404
    transcript_text = transcript_record.get("plain_transcript", "")
    
    # Create PDF
    title = "Lecture Transcript - English"
    pdf_buffer = create_pdf(transcript_text, title)
    
    # Return PDF file with explicit headers and buffer positioning
    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"transcript_{lecture_id}_english.pdf",
        etag=False,
        conditional=True,
        last_modified=None
    )

def analyze_transcript(lecture_id, user_id):
    """
    Analyzes transcript to identify question timestamps.
    """
    transcript_data = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id}, {"_id": 0})
    if not transcript_data:
        raise Exception(f"Transcript not found for lecture_id: {lecture_id} and user_id: {user_id}")

    file_contents = transcript_data.get("json_transcript")

    # Write transcript to temporary file for analysis
    with open('temp_analyze_transcript.txt', "w") as f:
        f.write(str(file_contents) + "\n")

    temp_upload = genai.upload_file('temp_analyze_transcript.txt')
    result = gemini_model.generate_content(
        [temp_upload, "\n\n\n\n",r"""Analyze this transcript and give me the time stamp in JSON format, 
        where questions are being asked.
        Use this JSON schema:


        QuestionTimestamps = Dict(str: List[Dict(str: List(int, int))])

        Example:
        QuestionTimestamps = \{'questions':  [\{'Is the 2+2=4?': [15.222, 17.222]\}, \{'Is the capital of France, Pairs?', [254.506, 258.990]\}\}

        Return: QuestionTimestamps


        (The first timestamp if for answering yes, and the second timestamp is for answering no).

        """], request_options=RequestOptions(retry=retry.Retry(initial=10, multiplier=2, maximum=60, timeout=300))
    )
    
    # Parse result and convert to JSON
    res_str = str(result.text)
    if '\n' in res_str:
        res_str = res_str.split('\n', 1)[1]
    if res_str.endswith('```'):
        res_str = res_str[:-4]
    if res_str.startswith('```json'):
        res_str = res_str[8:]
    
    # Clean up temporary file
    os.remove('temp_analyze_transcript.txt')
    
    try:
        res_json = json.loads(res_str)
        return res_json
    except json.JSONDecodeError:
        print(f"Failed to parse JSON: {res_str}")
        # Return a default structure if parsing fails
        return {"questions": []}


@video_processing_bp.route("/")
def home():
    return jsonify({"message": "Video Processing API is running"}), 200

@video_processing_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_video_general():
    """
    Endpoint to upload a video file and generate a lecture ID with optional translation language.
    """
    user_id = get_jwt_identity()
    # For consistency with app.py format
    if isinstance(user_id, dict):
        user_id = user_id.get('userId') or user_id.get('email')
    
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({"error": "No video file selected"}), 400
    
    # Get the preferred language (default to English)
    preferred_language = request.form.get('language', 'english').lower()
    if preferred_language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": f"Unsupported language. Supported options are: {', '.join(SUPPORTED_LANGUAGES)}"}), 400
    
    # Generate a new lecture ID
    import uuid
    lecture_id = str(uuid.uuid4())
    
    video_filename = f"{lecture_id}.mp4"
    video_path = os.path.join(UPLOAD_FOLDER, video_filename)
    
    # Save the uploaded file
    video_file.save(video_path)

    # Update processing status
    processing_status_collection.update_one(
        {"lecture_id": lecture_id, "user_id": user_id},
        {"$set": {
            "status": "processing",
            "stage": "uploading",
            "progress": 0,
            "preferred_language": preferred_language
        }},
        upsert=True
    )
    
    # Process the video in a separate process to avoid blocking
    process = multiprocessing.Process(
        target=process_video_and_transcript,
        args=(video_path, lecture_id, user_id, preferred_language)
    )
    process.start()
    
    return jsonify({
        "message": "Video upload successful. Processing started.",
        "lecture_id": lecture_id,
        "preferred_language": preferred_language
    }), 202


@video_processing_bp.route("/upload/<lecture_id>", methods=["POST"])
@jwt_required()
def upload_video(lecture_id):
    """
    Endpoint to upload a video file for processing using an existing lecture ID with optional translation language.
    """
    user_id = get_jwt_identity()
    # For consistency with app.py format
    if isinstance(user_id, dict):
        user_id = user_id.get('userId') or user_id.get('email')
    
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({"error": "No video file selected"}), 400
    
    # Get the preferred language (default to English)
    preferred_language = request.form.get('language', 'english').lower()
    if preferred_language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": f"Unsupported language. Supported options are: {', '.join(SUPPORTED_LANGUAGES)}"}), 400
    
    # Use the provided lecture_id from the URL
    video_filename = f"{lecture_id}.mp4"
    video_path = os.path.join(UPLOAD_FOLDER, video_filename)
    
    # Save the uploaded file
    video_file.save(video_path)

    # Update processing status
    processing_status_collection.update_one(
        {"lecture_id": lecture_id, "user_id": user_id},
        {"$set": {
            "status": "processing",
            "stage": "uploading",
            "progress": 0,
            "preferred_language": preferred_language
        }},
        upsert=True
    )
    
    # Process the video in a separate process to avoid blocking
    process = multiprocessing.Process(
        target=process_video_and_transcript,
        args=(video_path, lecture_id, user_id, preferred_language)
    )
    process.start()
    
    return jsonify({
        "message": "Video upload successful. Processing started.",
        "lecture_id": lecture_id,
        "preferred_language": preferred_language
    }), 202

def process_video_and_transcript(video_path, lecture_id, user_id, preferred_language="english"):
    """
    Process a video file to generate transcript and analyze content, optionally translating the transcript.
    """
    try:
        # Update status to audio extraction
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"stage": "extracting_audio", "progress": 10}},
            upsert=True
        )
        
        # Extract audio from video
        audio_path = os.path.join(PROCESSED_FOLDER, f"{lecture_id}_audio.mp3")
        extract_audio(video_path, audio_path)
        
        # Update status to audio splitting
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"stage": "splitting_audio", "progress": 20}},
            upsert=True
        )
        
        # Split audio into chunks for processing
        chunk_paths = split_audio(audio_path, output_dir=os.path.join(PROCESSED_FOLDER, f"{lecture_id}_chunks"))
        
        # Update status to transcription
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"stage": "transcribing", "progress": 30}},
            upsert=True
        )
        
        # Transcribe audio chunks with timestamps
        transcripts = transcribe_audio_chunks_with_timestamps(chunk_paths)
        
        # Update status to saving transcripts
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"stage": "saving_transcripts", "progress": 60}},
            upsert=True
        )
        
        # Save transcripts to database
        plain_transcript = save_transcripts_with_timestamps(transcripts, lecture_id, user_id)
        
        # Translate transcript if language is not English
        if preferred_language.lower() != "english":
            # Update status to translation
            processing_status_collection.update_one(
                {"lecture_id": lecture_id, "user_id": user_id},
                {"$set": {"stage": f"translating_to_{preferred_language}", "progress": 65}},
                upsert=True
            )
            
            # Translate transcript
            translated_text = translate_text(plain_transcript, preferred_language.capitalize())
            
            # Save translation to database
            translations_collection.insert_one({
                "lecture_id": lecture_id,
                "user_id": user_id,
                "language": preferred_language.lower(),
                "translated_text": translated_text
            })
        
        # Update status to video processing
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"stage": "analyzing_video", "progress": 70}},
            upsert=True
        )
        
        # Process video for hand raise detection and question analysis
        process_video(video_path, lecture_id, user_id)
        
        # Clean up temporary files
        os.remove(audio_path)
        for chunk in chunk_paths:
            if os.path.exists(chunk):
                os.remove(chunk)
        
        # Update status to completed
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"status": "completed", "stage": "completed", "progress": 100}},
            upsert=True
        )
        
        print(f"Processing completed for lecture {lecture_id}")
    except Exception as e:
        print(f"Error processing video: {str(e)}")
        # Update status to error
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"status": "error", "stage": "error", "error": str(e), "progress": 0}},
            upsert=True
        )
        # Log error to database
        results_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {"error": str(e)}},
            upsert=True
        )

@video_processing_bp.route("/transcript/<lecture_id>", methods=["GET"])
@jwt_required()
def get_transcript(lecture_id):
    """
    Endpoint to retrieve the transcript for a processed video with optional language selection.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    # Get requested language (default to stored preference or English)
    status = processing_status_collection.find_one({"lecture_id": lecture_id, "user_id": user_id})
    default_language = status.get("preferred_language", "english") if status else "english"
    language = request.args.get('language', default_language).lower()
    
    if language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": f"Unsupported language. Supported options are: {', '.join(SUPPORTED_LANGUAGES)}"}), 400
    
    # Stream the transcript to client with specified language
    return stream_transcripts(lecture_id, user_id, language)

@video_processing_bp.route("/results/<lecture_id>", methods=["GET"])
@jwt_required()
def get_results(lecture_id):
    """
    Endpoint to retrieve the analysis results for a processed video.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    # Get results from database
    result = results_collection.find_one({"lecture_id": lecture_id, "user_id": user_id})
    if not result:
        return jsonify({"error": "Results not found"}), 404
    
    # Convert ObjectId to string for JSON serialization
    result_json = json.loads(dumps(result))
    
    return jsonify(result_json), 200

@video_processing_bp.route("/status/<lecture_id>", methods=["GET"])
@jwt_required()
def get_processing_status(lecture_id):
    """
    Endpoint to check the processing status of a video.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    status = processing_status_collection.find_one(
        {"lecture_id": lecture_id, "user_id": user_id},
        {"_id": 0}
    )
    
    if not status:
        return jsonify({"error": "Lecture not found"}), 404
        
    return jsonify(status), 200

@video_processing_bp.route("/update-dashboard", methods=["POST"])
@jwt_required()
def update_dashboard():
    """
    Endpoint to update the dashboard settings for a user.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Check if the user already has a dashboard entry
    dashboard = db.dashboard_settings.find_one({"user_id": user_id})
    
    if dashboard:
        # Check if any changes were made
        changes_made = False
        for key, value in data.items():
            if key not in dashboard or dashboard[key] != value:
                changes_made = True
                break
        
        if not changes_made:
            return jsonify({"message": "No changes made to the dashboard"}), 400
        
        # Update existing dashboard
        db.dashboard_settings.update_one(
            {"user_id": user_id},
            {"$set": data}
        )
        
        return jsonify({
            "message": "Dashboard updated successfully",
            "user_id": user_id
        }), 200
    else:
        # Create new dashboard entry
        new_dashboard = {
            "user_id": user_id,
            **data
        }
        
        db.dashboard_settings.insert_one(new_dashboard)
        
        return jsonify({
            "message": "Dashboard created successfully",
            "user_id": user_id
        }), 201



@video_processing_bp.route("/translations", methods=["GET"])
@jwt_required()
def get_available_translations():
    """
    Endpoint to get all available languages for a transcript.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    lecture_id = request.args.get('lecture_id')
    if not lecture_id:
        return jsonify({"error": "lecture_id parameter is required"}), 400
    
    # Check if original transcript exists
    transcript = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id})
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    # Get all available translations
    translations = list(translations_collection.find(
        {"lecture_id": lecture_id, "user_id": user_id},
        {"_id": 0, "language": 1}
    ))
    
    # Always include English as an available language
    available_languages = ["english"] + [t["language"] for t in translations if t["language"] != "english"]
    
    return jsonify({
        "lecture_id": lecture_id,
        "available_languages": available_languages,
        "supported_languages": SUPPORTED_LANGUAGES
    }), 200

@video_processing_bp.route("/translate", methods=["POST"])
@jwt_required()
def translate_transcript():
    """
    Endpoint to request translation of an existing transcript.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    lecture_id = data.get('lecture_id')
    target_language = data.get('language', '').lower()
    
    if not lecture_id:
        return jsonify({"error": "lecture_id is required"}), 400
    
    if not target_language or target_language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": f"Valid language parameter is required. Supported languages: {', '.join(SUPPORTED_LANGUAGES)}"}), 400
    
    # Skip if English is requested (original transcript)
    if target_language == "english":
        return jsonify({
            "message": "Original transcript already available in English",
            "lecture_id": lecture_id
        }), 200
    
    # Check if translation already exists
    existing_translation = translations_collection.find_one({
        "lecture_id": lecture_id,
        "user_id": user_id,
        "language": target_language
    })
    
    if existing_translation:
        return jsonify({
            "message": f"Translation to {target_language} already exists",
            "lecture_id": lecture_id
        }), 200
    
    # Get original transcript
    transcript_record = transcripts_collection.find_one({"lecture_id": lecture_id, "user_id": user_id})
    if not transcript_record:
        return jsonify({"error": "Original transcript not found"}), 404
    
    original_text = transcript_record.get("plain_transcript", "")
    
    # Start translation in a separate process
    process = multiprocessing.Process(
        target=process_translation,
        args=(original_text, lecture_id, user_id, target_language)
    )
    process.start()
    
    return jsonify({
        "message": f"Translation to {target_language} initiated",
        "lecture_id": lecture_id,
        "language": target_language,
        "status": "processing"
    }), 202

def process_translation(text, lecture_id, user_id, target_language):
    """
    Process translation of text in a separate process.
    """
    try:
        # Update processing status
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {
                "translation_status": "processing",
                "translation_language": target_language,
                "translation_progress": 0
            }},
            upsert=True
        )
        
        # Translate the text
        translated_text = translate_text(text, target_language.capitalize())
        
        # Save translation
        translations_collection.insert_one({
            "lecture_id": lecture_id,
            "user_id": user_id,
            "language": target_language,
            "translated_text": translated_text
        })
        
        # Update processing status
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {
                "translation_status": "completed",
                "translation_language": target_language,
                "translation_progress": 100
            }}
        )
        
    except Exception as e:
        print(f"Error translating text: {str(e)}")
        # Update error status
        processing_status_collection.update_one(
            {"lecture_id": lecture_id, "user_id": user_id},
            {"$set": {
                "translation_status": "error",
                "translation_language": target_language,
                "translation_error": str(e)
            }}
        )

@video_processing_bp.route("/translation-status/<lecture_id>", methods=["GET"])
@jwt_required()
def get_translation_status(lecture_id):
    """
    Endpoint to check the status of a translation.
    """
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email') if isinstance(current_user, dict) else current_user
    
    language = request.args.get('language')
    if not language or language not in SUPPORTED_LANGUAGES:
        return jsonify({"error": f"Valid language parameter is required. Supported languages: {', '.join(SUPPORTED_LANGUAGES)}"}), 400
    
    # Skip if English is requested (original transcript)
    if language == "english":
        return jsonify({
            "status": "completed",
            "language": "english",
            "lecture_id": lecture_id
        }), 200
    
    # Check if translation exists
    translation = translations_collection.find_one({
        "lecture_id": lecture_id,
        "user_id": user_id,
        "language": language
    })
    
    if translation:
        return jsonify({
            "status": "completed",
            "language": language,
            "lecture_id": lecture_id
        }), 200
    
    # Check processing status
    status = processing_status_collection.find_one({
        "lecture_id": lecture_id,
        "user_id": user_id
    })
    
    if status and "translation_status" in status and status.get("translation_language") == language:
        return jsonify({
            "status": status.get("translation_status", "unknown"),
            "progress": status.get("translation_progress", 0),
            "language": language,
            "lecture_id": lecture_id,
            "error": status.get("translation_error")
        }), 200
    
    return jsonify({
        "status": "not_started",
        "language": language,
        "lecture_id": lecture_id
    }), 200