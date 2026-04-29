FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY publish_helper_app.py .
CMD ["uvicorn", "publish_helper_app:app", "--host", "0.0.0.0", "--port", "8010"]
