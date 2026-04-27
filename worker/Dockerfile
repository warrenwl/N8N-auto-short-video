FROM python:3.11-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    curl \
    fontconfig \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -fv

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV DATA_DIR=/data
ENV OUTPUT_ROOT=/data/output
ENV TTS_BASE_URL=http://host.docker.internal:8010
ENV TZ=Asia/Shanghai

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
