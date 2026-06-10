#!/bin/sh
# Import and activate the Alcovia workflow, then start n8n

# Import the workflow from the mounted file
n8n import:workflow --input=/home/node/workflow-src/workflow.json

# Publish/activate the imported workflow (id=1 as set in workflow.json)
n8n publish:workflow --id=1

# Start n8n normally
exec n8n
