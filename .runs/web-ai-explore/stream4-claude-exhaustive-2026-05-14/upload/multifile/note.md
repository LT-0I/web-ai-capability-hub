status: PASS
observation: Three files (text/CSV/PNG) uploaded simultaneously via `#chat-input-file-upload-onpage` in a single message. Claude correctly identified each file's content type and one observed fact: text=lorem ipsum filler, CSV=city populations with Shanghai/Paris entries, PNG=solid red. All three referenced in same response.
files: smoke-text.txt, smoke-data.csv, smoke-image.png
selector: #chat-input-file-upload-onpage
prompt: "I uploaded three files (a text file, a CSV, and an image). For each: name its content type and one observed fact. Format as three numbered lines."
response_path: response.txt
