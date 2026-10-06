# Bach to Basics: backend image
# Python 3.12 supports the core requirements and optional Basic Pitch deps.
FROM python:3.12-slim

# The default image stays lightweight. Optional Audiveris installation happens
# only at build time, never at startup or while handling a score upload.
ARG INSTALL_AUDIVERIS=0

# Keep Java for users of a legacy standalone JAR. The optional official
# Audiveris package uses its own bundled Java runtime instead.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        default-jre-headless \
        ffmpeg \
        poppler-utils \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts/install_audiveris.py ./scripts/install_audiveris.py
RUN case "$INSTALL_AUDIVERIS" in \
      0) ;; \
      1) python scripts/install_audiveris.py --install ;; \
      *) echo "INSTALL_AUDIVERIS must be 0 or 1" >&2; exit 2 ;; \
    esac \
    && rm -rf /var/lib/apt/lists/*

# Cache Python dependencies independently of source changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

# Check the launcher with the same non-root account as the API. This is a
# packaging check, not proof of successful recognition of a particular score.
RUN if [ "$INSTALL_AUDIVERIS" = "1" ]; then audiveris -batch -help; fi
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
