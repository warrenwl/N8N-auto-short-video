#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 '<full_review_action_url>'"
  echo "Example: $0 'http://localhost:5678/webhook-test/video-review-action?action=approve&task_id=001&token=xxx'"
  exit 1
fi

curl -i "$1"
