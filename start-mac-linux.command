#!/bin/sh
# Uloominate prototype — double-click this file to run the prototype.
# It starts a small local web server in this folder and opens the start page.

cd "$(dirname "$0")" || exit 1

PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:$PORT/"

if command -v python3 >/dev/null 2>&1; then
  SERVER="python3 -m http.server $PORT"
elif command -v python >/dev/null 2>&1; then
  SERVER="python -m SimpleHTTPServer $PORT"
elif command -v php >/dev/null 2>&1; then
  SERVER="php -S localhost:$PORT"
elif command -v npx >/dev/null 2>&1; then
  SERVER="npx --yes serve . -l $PORT"
else
  echo "No web server found. Install Python 3 from https://python.org and try again."
  read -r _
  exit 1
fi

echo "Uloominate prototype"
echo "Serving this folder at http://localhost:$PORT"
echo "Opening $URL"
echo ""
echo "Leave this window open while you use the prototype."
echo "Press Ctrl+C here to stop."
echo ""

( sleep 1; (command -v open >/dev/null 2>&1 && open "$URL") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL") ) &

exec $SERVER
