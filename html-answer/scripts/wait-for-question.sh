#!/bin/bash
# Long-poll the html-answer interactive server for the next reader question.
# Exits 0 printing the question JSON when one arrives; exits 1 printing
# {"type":"server-gone"} after repeated connection failures.
#
# usage: wait-for-question.sh <port>
set -u
PORT="${1:?usage: wait-for-question.sh <port>}"
errs=0
while :; do
  resp=$(curl -fsS --max-time 60 "http://localhost:${PORT}/api/questions/wait?timeoutMs=50000")
  if [ $? -ne 0 ]; then
    errs=$((errs + 1))
    if [ "$errs" -ge 5 ]; then
      echo '{"type":"server-gone"}'
      exit 1
    fi
    sleep 2
    continue
  fi
  errs=0
  case "$resp" in
    *'"type":"question"'*)
      echo "$resp"
      exit 0
      ;;
    *) ;; # timeout sentinel — keep waiting
  esac
done
