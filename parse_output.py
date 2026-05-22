import sys
import re

content = sys.stdin.read()

phases = ["TYPECHECK", "LINT", "TEST", "BUILD"]
results = {}

for phase in phases:
    start_marker = f"---{phase}---"
    end_marker = f"{phase}_EXIT="
    
    try:
        start_idx = content.index(start_marker) + len(start_marker)
        end_idx = content.index(end_marker)
        
        phase_output = content[start_idx:end_idx].strip()
        exit_code_match = re.search(fr"{end_marker}(\d+)", content[end_idx:])
        exit_code = exit_code_match.group(1) if exit_code_match else "Unknown"
        
        results[phase] = {
            "output": phase_output,
            "exit_code": exit_code
        }
    except ValueError:
        results[phase] = {"output": "Not found", "exit_code": "Unknown"}

for phase, data in results.items():
    print(f"=== {phase} (Exit Code: {data['exit_code']}) ===")
    lines = data['output'].splitlines()
    if len(lines) > 20:
        print("\n".join(lines[-20:]))
    else:
        print(data['output'])
    print("\n")
