from flask import Flask, request, jsonify, redirect, url_for, render_template, make_response, send_file
from flask_pymongo import PyMongo
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime, timedelta
from markdown import markdown
import google.generativeai as genai
import os
from dotenv import load_dotenv
import uuid
import pdfkit
import smtplib
import random
from notes_route import notes_route
from quiz_route import quiz_route
from transcript_proc import video_processing_bp


app = Flask(__name__)

# Configure other application settings from environment
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY')
app.config['MONGO_URI'] = os.environ.get('MONGO_URI')

# Convert string values to appropriate types
jwt_access_expires_minutes = int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 60))
jwt_refresh_expires_days = int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRES', 7))

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=jwt_access_expires_minutes)
app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=jwt_refresh_expires_days)
# Initialize extensions
jwt = JWTManager(app)
mongo = PyMongo(app)
bcrypt = Bcrypt(app)

# MongoDB Collections
users_collection = mongo.db.users
subjects_col = mongo.db.subjects
chapters_col = mongo.db.chapters
topics_col = mongo.db.topics
lectures_col = mongo.db.lectures
notes_col = mongo.db.notes
quizzes_col = mongo.db.quizzes
transcripts_collection = mongo.db.transcripts
results_collection = mongo.db.results



# Apply CORS to the app
CORS(app, 
    origins=["http://localhost:3000"],
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)

# Store OTPs temporarily
otp_store = {}

# Load environment variables from .env file
load_dotenv()

# Register blueprints
app.register_blueprint(notes_route, url_prefix='/notes')
app.register_blueprint(quiz_route, url_prefix='/quiz')
app.register_blueprint(video_processing_bp)

# Configure Gemini with the API key from environment
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
app.config['GEMINI_API_KEY'] = GEMINI_API_KEY
genai.configure(api_key=GEMINI_API_KEY)

# Define the model
try:
    model = genai.GenerativeModel("gemini-1.5-flash")  # Specify the Gemini model to use
    print("Gemini model initialized successfully!")
except Exception as e:
    print(f"Error initializing Gemini model: {e}")
    model = None
# ---------------------- AUTHENTICATION ROUTES ---------------------- #

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    phone_number = data.get('phone_number')
    email = data.get('email')
    
    # Basic validation
    if not all([username, password, email]):
        return jsonify(message="Missing required fields"), 400
    
    # Check if user already exists
    if users_collection.find_one({'$or': [
        {'username': username},
        {'email': email},
        {'phone_number': phone_number} if phone_number else {'_id': None}
    ]}):
        return jsonify(message="User already exists"), 400
    
    # Create new user
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = {
        'username': username,
        'password': hashed_password,
        'phone_number': phone_number,
        'email': email,
        'created_at': datetime.now()
    }
    
    users_collection.insert_one(new_user)
    return jsonify(message="User registered successfully"), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    # Basic validation
    if not all([email, password]):
        return jsonify(message="Missing email or password"), 400
    
    # Find the user in the database by email
    user = users_collection.find_one({'email': email})
    
    # Check if user exists and password is correct
    if user and bcrypt.check_password_hash(user.get('password', ''), password):
        # Create the access token with user information
        access_token = create_access_token(identity={
            'email': email,
            'username': user.get('username', ''),
            'userId': str(user.get('_id'))
        })
        return jsonify(access_token=access_token), 200
    
    return jsonify(message="Invalid credentials"), 401

@app.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    # JWT blacklisting would be implemented here in a production app
    return jsonify(message="Logged out successfully"), 200

@app.route('/request-reset-password', methods=['POST'])
def request_reset_password():
    data = request.get_json()
    email = data.get('email')
    
    if not email:
        return jsonify(message="Email is required"), 400
    
    user = users_collection.find_one({'email': email})
    if not user:
        return jsonify(message="User with given email not found"), 404
    
    otp = random.randint(100000, 999999)
    otp_store[email] = {
        'otp': otp,
        'expires_at': datetime.now() + timedelta(minutes=10)  # OTP valid for 10 minutes
    }
    
    # In production, use a secure email service instead of hardcoded credentials
    email_username = os.environ.get('EMAIL_USERNAME')
    email_password = os.environ.get('EMAIL_PASSWORD')
    
    if not all([email_username, email_password]):
        # For development/testing
        print(f"OTP for {email}: {otp}")
        return jsonify(message="OTP generated (check server logs in development mode)"), 200
    
    try:
        # Use SSL connection for more security
        smtp_server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        # No need for starttls with SMTP_SSL
        smtp_server.login(email_username, email_password)
        
        # Create a proper email message
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        message = MIMEMultipart()
        message['From'] = email_username
        message['To'] = email
        message['Subject'] = "Password Reset OTP"
        
        body = f"""
        <html>
        <body>
            <h2>Password Reset Request</h2>
            <p>Your OTP for password reset is: <strong>{otp}</strong></p>
            <p>This OTP is valid for 10 minutes.</p>
            <p>If you did not request this password reset, please ignore this email.</p>
        </body>
        </html>
        """
        
        message.attach(MIMEText(body, 'html'))
        
        smtp_server.send_message(message)
        smtp_server.quit()
        return jsonify(message="OTP sent to email"), 200
    except Exception as e:
        print(f"Email sending failed: {str(e)}")  # Log the actual error
        return jsonify(message="Failed to send OTP", error=str(e)), 500

@app.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email')
    otp = int(data.get('otp', 0))
    
    if not all([email, otp]):
        return jsonify(message="Email and OTP are required"), 400
    
    if email in otp_store:
        stored_otp_data = otp_store[email]
        if stored_otp_data['otp'] == otp and datetime.now() <= stored_otp_data['expires_at']:
            # Generate reset token
            reset_token = create_access_token(
                identity={'email': email, 'reset': True},
                expires_delta=timedelta(minutes=10)
            )
            return jsonify(message="OTP verified", reset_token=reset_token), 200
    
    return jsonify(message="Invalid or expired OTP"), 401

@app.route('/reset-password', methods=['POST'])
@jwt_required()
def reset_password():
    data = request.get_json()
    new_password = data.get('new_password')
    confirm_password = data.get('confirm_password')
    
    if not all([new_password, confirm_password]):
        return jsonify(message="All fields are required"), 400
    
    if new_password != confirm_password:
        return jsonify(message="Passwords do not match"), 400
    
    # Get the current user from the JWT token
    current_user = get_jwt_identity()
    if not current_user:
        return jsonify(message="Unauthorized user"), 401
    
    # Retrieve the user's record from MongoDB
    user_record = users_collection.find_one({'email': current_user['email']})
    if not user_record:
        return jsonify(message="User not found"), 404
    
    # Hash the new password
    hashed_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    
    # Update the password in MongoDB
    update_result = users_collection.update_one(
        {'email': current_user['email']},
        {'$set': {'password': hashed_password}}
    )
    
    if update_result.modified_count == 1:
        return jsonify(message="Password has been reset successfully"), 200
    
    return jsonify(message="Password update failed"), 500

@app.route('/user', methods=['GET'])
@jwt_required()
def get_user():
    current_user = get_jwt_identity()
    if current_user:
        return jsonify({
            "username": current_user.get('username'),
            "email": current_user.get('email')
        }), 200
    return jsonify({"message": "No user logged in"}), 403

# ---------------------- HELPER DECORATORS ---------------------- #

def user_required(f):
    """Decorator to ensure user is authenticated and add user info to request"""
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        # Get the current user from the JWT
        current_user = get_jwt_identity()
        if not current_user:
            return jsonify({"error": "Authentication required"}), 401
        
        # Add user to request context
        request.current_user = current_user
        return f(*args, **kwargs)
    return decorated

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        'message': 'The token has expired.',
        'error': 'token_expired'
    }), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({
        'message': 'Signature verification failed.',
        'error': 'invalid_token'
    }), 401

# ---------------------- DASHBOARD ROUTES ---------------------- #

@app.route('/', methods=['GET'])
def hello():
    return jsonify("Hello World")

# --- SUBJECTS API --- #

# Example for get_all_subjects:
@app.route('/subjects', methods=['GET'])
@user_required
def get_all_subjects():
    try:
        current_user = get_jwt_identity()
        user_id = current_user.get('userId') or current_user.get('email')
        
        # Find subjects belonging to the current user
        subjects = list(subjects_col.find({'userId': user_id}, {'_id': 0}))
        return jsonify(subjects)
    except Exception as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    
@app.route('/subject/<subject_id>', methods=['GET'])
@user_required
def get_subject_details(subject_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    subject = subjects_col.find_one({"id": subject_id, "userId": user_id}, {'_id': 0})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    return jsonify(subject)

@app.route('/subject', methods=['POST'])
@user_required
def add_subject():
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Add user ID to the subject data
    data['userId'] = user_id
    data['id'] = str(uuid.uuid4())
    data['created_at'] = datetime.now().isoformat()
    
    # Insert the subject into the collection
    subjects_col.insert_one(data)
    return jsonify({"message": "Subject added successfully", "id": data['id']}), 201

@app.route('/subject/<subject_id>', methods=['PUT'])
@user_required
def edit_subject(subject_id):
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership
    subject = subjects_col.find_one({"id": subject_id, "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Don't allow changing ownership
    if 'userId' in data:
        del data['userId']
    
    data['updated_at'] = datetime.now().isoformat()
    
    # Update the subject
    result = subjects_col.update_one({"id": subject_id, "userId": user_id}, {"$set": data})
    return jsonify({"message": "Subject updated successfully"})

@app.route('/subject/<subject_id>', methods=['DELETE'])
@user_required
def delete_subject(subject_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership and delete
    result = subjects_col.delete_one({"id": subject_id, "userId": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Optionally, cascade delete related chapters, topics, and lectures
    chapters_col.delete_many({"subject_id": subject_id})
    
    # Delete related topics and lectures as well
    topic_ids = [topic['id'] for topic in topics_col.find({"subject_id": subject_id})]
    topics_col.delete_many({"subject_id": subject_id})
    lectures_col.delete_many({"subject_id": subject_id})
    
    return jsonify({"message": "Subject and related data deleted successfully"})

# --- CHAPTERS API --- #

@app.route('/chapters/<subject_id>', methods=['GET'])
@user_required
def get_chapters_by_subject(subject_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # First verify subject ownership
    subject = subjects_col.find_one({"id": subject_id, "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Query the chapters
    chapters = list(chapters_col.find({'subject_id': subject_id}, {'_id': 0}))
    return jsonify(chapters)

@app.route('/chapter', methods=['POST'])
@user_required
def add_chapter():
    data = request.json
    # Validate required fields
    if not data or 'subject_id' not in data or 'name' not in data:
        return jsonify({"error": "Missing required fields"}), 400
    
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify subject ownership
    subject = subjects_col.find_one({"id": data.get('subject_id'), "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Create chapter with unique ID
    data['id'] = str(uuid.uuid4())
    data['created_at'] = datetime.now().isoformat()
    data['userId'] = user_id  # Track owner for faster queries
    
    # Insert the chapter
    result = chapters_col.insert_one(data)
    
    # Return the chapter data
    data['_id'] = str(result.inserted_id)  # Convert ObjectId to string
    return jsonify(data), 201

@app.route('/chapter/<chapter_id>', methods=['GET'])
@user_required
def get_chapter_details(chapter_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Get chapter
    chapter = chapters_col.find_one({"id": chapter_id, "userId": user_id}, {'_id': 0})
    if not chapter:
        return jsonify({"error": "Chapter not found or access denied"}), 404
    
    return jsonify(chapter)

@app.route('/chapter/<chapter_id>', methods=['PUT'])
@user_required
def edit_chapter(chapter_id):
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership
    chapter = chapters_col.find_one({"id": chapter_id, "userId": user_id})
    if not chapter:
        return jsonify({"error": "Chapter not found or access denied"}), 404
    
    # Don't allow changing ownership
    if 'userId' in data:
        del data['userId']
    
    data['updated_at'] = datetime.now().isoformat()
    
    # Update the chapter
    result = chapters_col.update_one({"id": chapter_id, "userId": user_id}, {"$set": data})
    return jsonify({"message": "Chapter updated successfully"})

@app.route('/chapter/<chapter_id>', methods=['DELETE'])
@user_required
def delete_chapter(chapter_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership and delete
    result = chapters_col.delete_one({"id": chapter_id, "userId": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Chapter not found or access denied"}), 404
    
    # Cascade delete related topics
    topics_col.delete_many({"chapter_id": chapter_id})
    
    return jsonify({"message": "Chapter and related topics deleted successfully"})

# --- TOPICS API --- #

@app.route('/topics/<chapter_id>', methods=['GET'])
@user_required
def get_topics(chapter_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # First verify chapter ownership
    chapter = chapters_col.find_one({"id": chapter_id, "userId": user_id})
    if not chapter:
        return jsonify({"error": "Chapter not found or access denied"}), 404
    
    # Query the topics
    topics = list(topics_col.find({"chapter_id": chapter_id}, {'_id': 0}))
    return jsonify(topics)

@app.route('/topic', methods=['POST'])
@user_required
def add_topic():
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify chapter ownership
    chapter = chapters_col.find_one({"id": data.get('chapter_id'), "userId": user_id})
    if not chapter:
        return jsonify({"error": "Chapter not found or access denied"}), 404
    
    # Create topic with unique ID
    data['id'] = str(uuid.uuid4())
    data['created_at'] = datetime.now().isoformat()
    data['userId'] = user_id  # Track owner for faster queries
    data['Status'] = data.get('Status', 'Incomplete')  # Default status
    
    # Insert the topic
    result = topics_col.insert_one(data)
    
    # Return the topic data
    data['_id'] = str(result.inserted_id)  # Convert ObjectId to string
    return jsonify(data), 201

@app.route('/topic/<topic_id>', methods=['GET'])
@user_required
def get_topic_details(topic_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Get topic
    topic = topics_col.find_one({"id": topic_id, "userId": user_id}, {'_id': 0})
    if not topic:
        return jsonify({"error": "Topic not found or access denied"}), 404
    
    return jsonify(topic)

@app.route('/topic/<topic_id>', methods=['PUT'])
@user_required
def edit_topic(topic_id):
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership
    topic = topics_col.find_one({"id": topic_id, "userId": user_id})
    if not topic:
        return jsonify({"error": "Topic not found or access denied"}), 404
    
    # Filter allowed fields
    allowed_fields = {'name', 'number_of_lectures', 'chapter_id', 'Status'}
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return jsonify({"error": "No valid fields to update."}), 400
    
    update_data['updated_at'] = datetime.now().isoformat()
    
    # Update the topic
    result = topics_col.update_one({"id": topic_id, "userId": user_id}, {"$set": update_data})
    return jsonify({"message": "Topic updated successfully"})

@app.route('/topic/<topic_id>', methods=['DELETE'])
@user_required
def delete_topic(topic_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership and delete
    result = topics_col.delete_one({"id": topic_id, "userId": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Topic not found or access denied"}), 404
    
    return jsonify({"message": "Topic deleted successfully"})

@app.route('/topic/<topic_id>/status', methods=['PUT'])
@user_required
def toggle_topic_status(topic_id):
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Validate input
    if 'Status' not in data:
        return jsonify({"error": "Status field is required."}), 400
    
    # Only allow specific status values
    allowed_statuses = {'Completed', 'Incomplete'}
    if data['Status'] not in allowed_statuses:
        return jsonify({"error": f"Invalid status value. Allowed values are {allowed_statuses}"}), 400
    
    # Verify ownership and update
    result = topics_col.update_one(
        {"id": topic_id, "userId": user_id},
        {"$set": {"Status": data['Status'], "updated_at": datetime.now().isoformat()}}
    )
    
    if result.matched_count == 0:
        return jsonify({"error": "Topic not found or access denied"}), 404
    
    return jsonify({"message": f"Topic status updated to {data['Status']} successfully."}), 200

@app.route('/getallIncompletetopics', methods=['GET'])
@user_required
def get_all_incomplete_topics():
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    pipeline = [
        {
            "$match": {
                "Status": "Incomplete",
                "userId": user_id
            }
        },
        {
            "$lookup": {
                "from": "chapters",
                "localField": "chapter_id",
                "foreignField": "id",
                "as": "chapter_info"
            }
        },
        {
            "$unwind": "$chapter_info"
        },
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "number_of_lectures": 1,
                "chapter_id": 1,
                "Status": 1,
                "chapter_name": "$chapter_info.name"
            }
        }
    ]
    
    incomplete_topics = list(topics_col.aggregate(pipeline))
    return jsonify(incomplete_topics)

# --- LECTURES API --- #

@app.route('/lectures/<subject_id>', methods=['GET'])
@user_required
def get_lectures_for_subject(subject_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify subject ownership
    subject = subjects_col.find_one({"id": subject_id, "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Get lectures
    lectures = list(lectures_col.find({"subject_id": subject_id, "userId": user_id}, {'_id': 0}))
    return jsonify(lectures)

@app.route('/lecture/<lecture_id>', methods=['GET'])
@user_required
def get_lecture_details(lecture_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Get lecture
    lecture = lectures_col.find_one({"id": lecture_id, "userId": user_id}, {'_id': 0})
    if not lecture:
        return jsonify({"error": "Lecture not found or access denied"}), 404
    
    return jsonify(lecture)

@app.route('/lecture', methods=['POST'])
@user_required
def add_lecture():
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify subject ownership
    subject = subjects_col.find_one({"id": data.get('subject_id'), "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Create lecture with unique ID
    data['id'] = str(uuid.uuid4())
    data['created_at'] = datetime.now().isoformat()
    data['userId'] = user_id  # Track owner for faster queries
    
    # Insert the lecture
    result = lectures_col.insert_one(data)
    
    # Return the lecture data
    data['_id'] = str(result.inserted_id)  # Convert ObjectId to string
    return jsonify(data), 201

@app.route('/lecture/<lecture_id>', methods=['PUT'])
@user_required
def edit_lecture(lecture_id):
    data = request.json
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership
    lecture = lectures_col.find_one({"id": lecture_id, "userId": user_id})
    if not lecture:
        return jsonify({"error": "Lecture not found or access denied"}), 404
    
    # Filter allowed fields
    allowed_fields = {'lecture_number', 'subject_id', 'title', 'description'}
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return jsonify({"error": "No valid fields to update."}), 400
    
    # If changing subject_id, verify ownership of the new subject
    if 'subject_id' in update_data and update_data['subject_id'] != lecture['subject_id']:
        new_subject = subjects_col.find_one({"id": update_data['subject_id'], "userId": user_id})
        if not new_subject:
            return jsonify({"error": "Subject not found or access denied"}), 404
    
    update_data['updated_at'] = datetime.now().isoformat()
    
    # Update the lecture
    result = lectures_col.update_one({"id": lecture_id, "userId": user_id}, {"$set": update_data})
    return jsonify({"message": "Lecture updated successfully"})

@app.route('/lecture/<lecture_id>', methods=['DELETE'])
@user_required
def delete_lecture(lecture_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify ownership and delete
    result = lectures_col.delete_one({"id": lecture_id, "userId": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Lecture not found or access denied"}), 404
    
    # Also delete any lecture plans
    try:
        lecture_plans_folder = f"lecture_plans/{user_id}"
        if os.path.exists(lecture_plans_folder):
            file_path = os.path.join(lecture_plans_folder, f"{lecture_id}.md")
            if os.path.exists(file_path):
                os.remove(file_path)
    except Exception as e:
        print(f"Error removing lecture plan file: {e}")
    
    return jsonify({"message": "Lecture deleted successfully"})

# --- LECTURE PLANS API --- #

@app.route('/generatelectureplan/<lecture_id>', methods=['GET'])
@user_required
def generate_lecture_plan(lecture_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Check if the lecture exists and belongs to user
    lecture = lectures_col.find_one({"id": lecture_id, "userId": user_id})
    if not lecture:
        return jsonify({"error": "Lecture not found or access denied"}), 404
    
    # Fetch all incomplete topics for this user
    pipeline = [
        {
            "$match": {
                "Status": "Incomplete",
                "userId": user_id
            }
        },
        {
            "$lookup": {
                "from": "chapters",
                "localField": "chapter_id",
                "foreignField": "id",
                "as": "chapter_info"
            }
        },
        {
            "$unwind": "$chapter_info"
        },
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "number_of_lectures": 1,
                "chapter_id": 1,
                "Status": 1,
                "chapter_name": "$chapter_info.name"
            }
        }
    ]
    
    incomplete_topics = list(topics_col.aggregate(pipeline))
    
    # Extract topic names for the Gemini prompt
    topic_names = [f"{topic['name']} (from chapter: {topic['chapter_name']})" for topic in incomplete_topics]
    
    # Create a prompt for Gemini API
    prompt = f"""
    Create a comprehensive lecture plan for a class on the following topics: {', '.join(topic_names)}.

    The lecture plan should include:

    1.Topics & Subtopics: A detailed breakdown of the concepts to be covered.
    2.Materials Needed: Any textbooks, slides, software, or tools required.
    3.Learning Objectives: Key takeaways students should gain by the end of the lecture.
    4.Timeline Breakdown: A structured schedule for covering each subtopic.
    5.Exercises & Homework: Recommended assignments, in-class activities, or problem sets.
    6.Additional Resources: Suggested readings, videos, or online courses for further learning.
    Format the response in Markdown to ensure clarity and easy sharing."""


    
    try:
        # Initialize Gemini API client
        import google.generativeai as genai
        
        # Configure the API key
        genai.configure(api_key=app.config['GEMINI_API_KEY'])
        
        # Generate content with Gemini
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        
        # Extract the generated content
        generated_content = response.text
        
        # Create the basic lecture plan headers and add the generated content
        md_content = f"# Lecture Plan for Lecture {lecture_id}\n\n"
        md_content += f"## Created by: {current_user.get('username')}\n\n"
        md_content += "## Topics to be covered:\n\n"
        
        # Add topics list from database
        for topic in incomplete_topics:
            md_content += f"- **{topic['name']}** (Chapter: {topic['chapter_name']})\n"
        
        md_content += "\n## Generated Lecture Plan:\n\n"
        md_content += generated_content
        
        # Ensure the lecture plans folder exists
        lecture_plans_folder = f"lecture_plans/{user_id}"
        if not os.path.exists(lecture_plans_folder):
            os.makedirs(lecture_plans_folder)

        # File path
        file_path = os.path.join(lecture_plans_folder, f"{lecture_id}.md")

        # Write the markdown content to the file
        with open(file_path, "w", encoding='utf-8') as f:
            f.write(md_content)

        return jsonify({
            "message": "Lecture plan generated successfully with Gemini AI",
            "file_path": file_path
        }), 200
        
    except Exception as e:
        # Handle API errors
        return jsonify({
            "error": f"Failed to generate lecture plan: {str(e)}",
            "message": "Creating basic template instead"
        }), 500


@app.route('/lectureplan/<lecture_id>', methods=['GET', 'PUT'])
@user_required
def lecture_plan(lecture_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Sanitize lecture_id for file path
    safe_lecture_id = secure_filename(lecture_id)
    file_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}.md")
    
    if request.method == 'GET':
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({"error": "Lecture plan not found"}), 404
        
        # Read the content of the lecture plan
        with open(file_path, "r", encoding='utf-8') as f:
            md_content = f.read()
        
        # Convert Markdown to HTML for rendering if requested
        format_type = request.args.get('format', 'md')
        if format_type == 'html':
            html_content = markdown(md_content)
            return jsonify({"content": html_content, "format": "html"}), 200
        
        return jsonify({"content": md_content, "format": "md"}), 200
    
    elif request.method == 'PUT':
        data = request.json
        new_content = data.get('content')
        
        if not new_content:
            return jsonify({"error": "Content is required"}), 400
        
        # Create directory if it doesn't exist
        lecture_plans_folder = f"lecture_plans/{user_id}"
        if not os.path.exists(lecture_plans_folder):
            os.makedirs(lecture_plans_folder)
        
        # Write the updated content to the file
        with open(file_path, "w", encoding='utf-8') as f:
            f.write(new_content)
        
        return jsonify({"message": "Lecture plan updated successfully"}), 200

@app.route('/exportlectureplan/<lecture_id>', methods=['GET'])
@user_required
def export_lecture_plan(lecture_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Sanitize lecture_id for file path
    safe_lecture_id = secure_filename(lecture_id)
    file_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}.md")
    
    # Check if the file exists
    if not os.path.exists(file_path):
        return jsonify({"error": "Lecture plan not found"}), 404
    
    # Read the content of the lecture plan
    with open(file_path, "r", encoding='utf-8') as f:
        md_content = f.read()
    
    # Convert markdown to HTML
    html_content = markdown(md_content)
    
    # Create a temporary HTML file
    temp_html_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}_temp.html")
    with open(temp_html_path, "w", encoding='utf-8') as f:
        f.write(f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                h1 {{ color: #333366; }}
                h2 {{ color: #666699; }}
            </style>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """)
    
    # Convert HTML to PDF using pdfkit
    pdf_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}.pdf")
    try:
        # Try using pdfkit without explicit configuration first
        try:
            pdfkit.from_file(temp_html_path, pdf_path)
        except Exception as e:
            # If that fails, try common wkhtmltopdf paths
            for wk_path in [
                '/usr/local/bin/wkhtmltopdf',  # Common on macOS/Linux
                '/usr/bin/wkhtmltopdf',        # Common on Linux
                'C:/Program Files/wkhtmltopdf/bin/wkhtmltopdf.exe',  # Windows
                'wkhtmltopdf'                  # If in PATH
            ]:
                try:
                    config = pdfkit.configuration(wkhtmltopdf=wk_path)
                    pdfkit.from_file(temp_html_path, pdf_path, configuration=config)
                    break
                except Exception:
                    continue
            else:
                # If all paths fail, raise the original exception
                raise e
                
        # Remove temporary HTML file
        os.remove(temp_html_path)
    except Exception as e:
        import traceback
        print(f"PDF Generation Error: {str(e)}")
        print(traceback.format_exc())
        # Since PDF generation failed, provide the HTML file instead
        return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500
    
    # Return the PDF file with proper headers
    response = send_file(
        pdf_path, 
        as_attachment=True, 
        download_name=f"Lecture_Plan_{safe_lecture_id}.pdf",
        mimetype='application/pdf'
    )
    return response

# --- AI ASSISTANCE ROUTES --- #

@app.route('/ai/generate-content', methods=['POST'])
@user_required
def generate_ai_content():
    if not model:
        return jsonify({"error": "AI generation is not available. GEMINI_API_KEY is not configured."}), 503
    
    data = request.json
    prompt = data.get('prompt')
    
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    
    try:
        response = model.generate_content(prompt)
        ai_content = response.text
        return jsonify({"content": ai_content}), 200
    except Exception as e:
        return jsonify({"error": f"AI generation failed: {str(e)}"}), 500

@app.route('/ai/enhance-lecture-plan/<lecture_id>', methods=['POST'])
@user_required
def enhance_lecture_plan(lecture_id):
    if not app.config.get('GEMINI_API_KEY') or not model:
        return jsonify({"error": "AI enhancement is not available. GEMINI_API_KEY is not configured."}), 503
    
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Sanitize lecture_id for file path
    safe_lecture_id = secure_filename(lecture_id)
    file_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}.md")
    
    # Check if the file exists
    if not os.path.exists(file_path):
        return jsonify({ "Lecture plan not found"}), 404
    
    # Read the content of the lecture plan
    with open(file_path, "r", encoding='utf-8') as f:
        current_plan = f.read()
    
    # Get the enhancement type from request
    data = request.json
    enhancement_type = data.get('enhancement_type', 'general')
    
    # Create prompts based on enhancement type
    prompt_map = {
        'general': f"Enhance the following lecture plan with more detailed points, better organization, and teaching tips:\n\n{current_plan}",
        'add_examples': f"Add relevant examples and case studies to this lecture plan:\n\n{current_plan}",
        'add_assessment': f"Add assessment questions and activities to this lecture plan:\n\n{current_plan}",
        'simplify': f"Simplify this lecture plan to make it more concise and focused:\n\n{current_plan}"
    }
    
    prompt = prompt_map.get(enhancement_type, prompt_map['general'])
    
    try:
        response = model.generate_content(prompt)
        enhanced_plan = response.text
        
        # Write the enhanced plan to a new file
        enhanced_file_path = os.path.join(f"lecture_plans/{user_id}", f"{safe_lecture_id}_enhanced.md")
        with open(enhanced_file_path, "w", encoding='utf-8') as f:
            f.write(enhanced_plan)
        
        return jsonify({
            "message": "Lecture plan enhanced successfully",
            "original_plan": current_plan,
            "enhanced_plan": enhanced_plan,
            "file_path": enhanced_file_path
        }), 200
    except Exception as e:
        return jsonify({"error": f"AI enhancement failed: {str(e)}"}), 500

# --- STATS AND ANALYTICS --- #

@app.route('/stats/dashboard', methods=['GET'])
@user_required
def get_dashboard_stats():
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Get counts from each collection for this user
    subjects_count = subjects_col.count_documents({"userId": user_id})
    chapters_count = chapters_col.count_documents({"userId": user_id})
    topics_count = topics_col.count_documents({"userId": user_id})
    lectures_count = lectures_col.count_documents({"userId": user_id})
    
    # Get completion stats
    completed_topics = topics_col.count_documents({"userId": user_id, "Status": "Completed"})
    incomplete_topics = topics_col.count_documents({"userId": user_id, "Status": "Incomplete"})
    
    # Calculate completion percentage
    completion_percentage = 0
    if topics_count > 0:
        completion_percentage = (completed_topics / topics_count) * 100
    
    return jsonify({
        "subjects_count": subjects_count,
        "chapters_count": chapters_count,
        "topics_count": topics_count,
        "lectures_count": lectures_count,
        "completed_topics": completed_topics,
        "incomplete_topics": incomplete_topics,
        "completion_percentage": round(completion_percentage, 2)
    }), 200

@app.route('/stats/progress/<subject_id>', methods=['GET'])
@user_required
def get_subject_progress(subject_id):
    current_user = get_jwt_identity()
    user_id = current_user.get('userId') or current_user.get('email')
    
    # Verify subject ownership
    subject = subjects_col.find_one({"id": subject_id, "userId": user_id})
    if not subject:
        return jsonify({"error": "Subject not found or access denied"}), 404
    
    # Get chapters for this subject
    chapters = list(chapters_col.find({"subject_id": subject_id, "userId": user_id}))
    
    # Initialize result structure
    result = {
        "subject": subject.get('name', 'Unknown Subject'),
        "chapters": []
    }
    
    # For each chapter, get completion stats
    for chapter in chapters:
        chapter_id = chapter.get('id')
        
        # Get topics for this chapter
        topics = list(topics_col.find({"chapter_id": chapter_id, "userId": user_id}))
        total_topics = len(topics)
        completed_topics = sum(1 for topic in topics if topic.get('Status') == 'Completed')
        
        # Calculate completion percentage
        completion_percentage = 0
        if total_topics > 0:
            completion_percentage = (completed_topics / total_topics) * 100
        
        # Add chapter stats to result
        result["chapters"].append({
            "chapter_id": chapter_id,
            "chapter_name": chapter.get('name', 'Unknown Chapter'),
            "total_topics": total_topics,
            "completed_topics": completed_topics,
            "completion_percentage": round(completion_percentage, 2)
        })
    
    return jsonify(result), 200


@app.route('/user-details', methods=['GET'])
@jwt_required()
def get_user_details():
    email = request.args.get('email')
    current_user = get_jwt_identity()
    
    # Security check - ensure the user is requesting their own data
    if not email or current_user.get('email') != email:
        return jsonify({"message": "Unauthorized access"}), 403
        
    # Find user in the database
    user = users_collection.find_one({'email': email})
    
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    # Return user details excluding sensitive information like password
    return jsonify({
        "username": user.get('username'),
        "email": user.get('email'),
        "phone_number": user.get('phone_number', ''),
        "created_at": user.get('created_at').isoformat() if user.get('created_at') else None
    }), 200

@app.route('/stats', methods=['GET'])
def get_stats():
    # Count the number of users
    user_count = users_collection.count_documents({})
    
    # Count the number of lectures
    lecture_count = lectures_col.count_documents({})
    
    return jsonify({
        "userCount": user_count,
        "lectureCount": lecture_count
    }), 200


# --- ERROR HANDLERS --- #

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Internal server error"}), 500

# In app.py - Add this before your app.run() call
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Make sure OPTIONS requests are handled globally too
@app.route('/<path:path>', methods=['OPTIONS'])
@app.route('/', methods=['OPTIONS'])
def options_handler(path=""):
    response = jsonify({})
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# --- RUN THE APP --- #

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') == 'development')