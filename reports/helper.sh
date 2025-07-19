#!/bin/bash

# Helper script to add missing last_entry to main.json files
# This script processes all .main.json files and adds the last_entry field
# from their corresponding .progress.json files if it's missing

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counter for statistics
updated_count=0
skipped_count=0
error_count=0

echo "Starting to process .main.json files in the current directory..."
echo ""

# Find all .main.json files in the current directory
for main_file in *.main.json; do
    # Check if any files were found
    if [ ! -f "$main_file" ]; then
        echo "No .main.json files found in the current directory."
        exit 0
    fi
    
    echo "Processing: $main_file"
    
    # Check if sync_status.last_entry exists
    has_last_entry=$(jq -r '.sync_status.last_entry // "missing"' "$main_file")
    
    if [ "$has_last_entry" != "missing" ]; then
        echo -e "${YELLOW}  → Skipping (last_entry already exists)${NC}"
        ((skipped_count++))
        continue
    fi
    
    # Get the progress file name from the main.json
    progress_file=$(jq -r '.sync_status.sync_progress_file // ""' "$main_file")
    
    if [ -z "$progress_file" ] || [ ! -f "$progress_file" ]; then
        echo -e "${RED}  → Error: Progress file not found or not specified: $progress_file${NC}"
        ((error_count++))
        continue
    fi
    
    # Get the last entry from the progress file
    last_entry=$(jq -c '.[-1] // null' "$progress_file")
    
    if [ "$last_entry" = "null" ] || [ -z "$last_entry" ]; then
        echo -e "${RED}  → Error: No entries found in progress file: $progress_file${NC}"
        ((error_count++))
        continue
    fi
    
    # Create a backup of the original file
    cp "$main_file" "${main_file}.backup"
    
    # Update the main.json file with the last_entry
    jq --argjson last_entry "$last_entry" '.sync_status.last_entry = $last_entry' "$main_file" > "${main_file}.tmp"
    
    # Replace the original file with the updated one
    mv "${main_file}.tmp" "$main_file"
    
    echo -e "${GREEN}  → Updated successfully${NC}"
    echo "    Last entry timestamp: $(echo "$last_entry" | jq -r '.t')"
    echo "    Block: $(echo "$last_entry" | jq -r '.b'), Slot: $(echo "$last_entry" | jq -r '.s')"
    
    ((updated_count++))
done

echo ""
echo "Summary:"
echo -e "  ${GREEN}Updated: $updated_count files${NC}"
echo -e "  ${YELLOW}Skipped: $skipped_count files (already have last_entry)${NC}"
echo -e "  ${RED}Errors: $error_count files${NC}"

if [ $updated_count -gt 0 ]; then
    echo ""
    echo "Backup files created with .backup extension"
    echo "To remove backups after verification: rm *.main.json.backup"
fi