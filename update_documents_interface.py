import re

file_path = 'frontend/mobile-app/mercon-app/src/lib/documents.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Add documentType to interface
old_interface = """export interface DriverDocument {
  id: string;
  doc_type: string;
  status: string;"""

new_interface = """export interface DriverDocument {
  id: string;
  doc_type: string;
  documentType?: { name: string } | null;
  status: string;"""

content = content.replace(old_interface, new_interface)

with open(file_path, 'w') as f:
    f.write(content)
