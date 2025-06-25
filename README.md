## ClassLog: Enhancing Classroom Insights with AI


## Overview
ClassLog is an AI-powered platform designed to assist Teach For India fellows in managing large classroom environments efficiently. The system leverages AI technologies such as computer vision, natural language processing, and automated transcription to provide insights into student engagement and learning progress.

## Features
- **Video Processing**: Converts recorded classroom videos into text-based transcripts.
- **Lecture Planning**: Generates structured lecture plans based on topics and subjects.
- **Notes & Quiz Generation**: Creates study notes and quizzes from lecture transcripts.
- **User Authentication**: Manages user registration and authentication.

## Tech Stack
- **Frontend**: React.js
- **Backend**: Node.js, FastAPI, Python
- **Database**: MongoDB
- **AI Models**: Gemini AI


## Prerequisites
Before running the project, ensure you have the following installed:
- Python 3.8+
- Node.js
- MongoDB
- FFmpeg
- Required dependencies (listed in `requirements.txt` and `package.json`)

## Installation
### 1. Create a `.env` File (If Required for Environment Variables)
Create a `.env` file in the backend directory and add the following environment variables:
```sh
GEMINI_API_KEY="your_api_key"
MONGO_URI="your_mongo_url"
ROBOFLOW_KEY="your_roboflow_key"
EMAIL_USERNAME="your_email_id"
EMAIL_PASSWORD="your_email_password"
```

### 2. Install Dependencies for the Backend
Navigate to the backend directory and install the required dependencies:
```sh
cd backend
pip install -r requirements.txt
```

### 3. Install FFmpeg
Download and install FFmpeg from the official website:
[FFmpeg Download](https://www.ffmpeg.org)

### 4. Run the Backend
Start the backend server by running the following commands:
```sh
cd backend
python app.py
```
The backend will be available at: [https://localhost:5000](https://localhost:5000)

### 5. Run the Frontend
Navigate to the frontend directory and install dependencies:
```sh
cd frontend  
npm install  
npm start  
```
The frontend will be available at: [https://localhost:3000](https://localhost:3000)
