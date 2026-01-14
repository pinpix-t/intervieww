# Python Recruiting Bot - Railway Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first (for caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all code
COPY . .

# Set Python to run unbuffered (see logs immediately)
ENV PYTHONUNBUFFERED=1

# Set working directory to talking folder
WORKDIR /app/talking

# Run the commander
CMD ["python", "listener.py"]

