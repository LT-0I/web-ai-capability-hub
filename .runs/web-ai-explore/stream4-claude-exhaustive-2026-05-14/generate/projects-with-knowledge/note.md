status: PASS
project_id: 019e274a-c412-7663-9813-e4d4486f03a4
project_url: https://claude.ai/project/019e274a-c412-7663-9813-e4d4486f03a4
project_name: stream4-claude-test
project_chat_url: https://claude.ai/chat/f1a8563a-232c-4813-a5bc-15a71d2e1579
knowledge_added:
  - title: smoke-text-fixture
    via: "Add files" → "Add text content" (not file-upload-from-device, which requires native OS file picker not driveable over CDP)
    content_excerpt: "Stream-4 fixture marker: pineapple-octopus-glacier. Lorem ipsum dolor sit amet. This is a project-knowledge test fixture."
    chip_in_dom: "smoke-text-fixture 1 line TEXT"
verification_prompt: "Read the project knowledge attached to this project and reply with the exact three-word marker phrase you see in it."
response_captured: "The three-word marker phrase is: pineapple-octopus-glacier"
observations:
  - Project creation flow is at /projects/create (not a modal — full-page form).
  - "Add files" button → 3 menuitems: "Upload from device" (native file picker), "Add text content" (in-app modal with title + textarea), "GitHub" (connector flow).
  - Project knowledge propagates into chats started under that project. Asking for the marker in a fresh chat under the project returned the exact text.
  - Project NOT deleted per lane instructions ("Do not delete the project at end").
catalog_addition_candidate: "project-add-text-content" — direct paste-as-knowledge flow distinct from file upload. Useful for automation (avoids native file picker).
