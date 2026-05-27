#!/usr/bin/env bash
set +e
mkdir -p .runs/path-c-unpaywall/livesmoke .runs/path-c-unpaywall/downloads
mkdir -p '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/sae'
echo RUN sae 10.4271/2023-01-1234
node dist/src/cli.js webai:sae:download-pdf --doc-id '10.4271/2023-01-1234' --output-dir '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/sae' --unpaywall-email 'unpaywall-test@noeticmind.dev' --output-json > '.runs/path-c-unpaywall/livesmoke/sae-resmoke.json' 2> '.runs/path-c-unpaywall/livesmoke/sae-resmoke.stderr'
echo rc=$? >> .runs/path-c-unpaywall/livesmoke/sae-resmoke.stderr
mkdir -p '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/asce'
echo RUN asce 10.1061/AOMJAH.AOENG-0026
node dist/src/cli.js webai:asce:download-pdf --doc-id '10.1061/AOMJAH.AOENG-0026' --output-dir '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/asce' --unpaywall-email 'unpaywall-test@noeticmind.dev' --output-json > '.runs/path-c-unpaywall/livesmoke/asce-resmoke.json' 2> '.runs/path-c-unpaywall/livesmoke/asce-resmoke.stderr'
echo rc=$? >> .runs/path-c-unpaywall/livesmoke/asce-resmoke.stderr
mkdir -p '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/springer'
echo RUN springer 10.1007/s43621-024-00534-6
node dist/src/cli.js webai:springer:download-pdf --doc-id '10.1007/s43621-024-00534-6' --output-dir '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/springer' --unpaywall-email 'unpaywall-test@noeticmind.dev' --output-json > '.runs/path-c-unpaywall/livesmoke/springer-resmoke.json' 2> '.runs/path-c-unpaywall/livesmoke/springer-resmoke.stderr'
echo rc=$? >> .runs/path-c-unpaywall/livesmoke/springer-resmoke.stderr
mkdir -p '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/sciencedirect'
echo RUN sciencedirect 10.1016/j.heliyon.2024.e28742
node dist/src/cli.js webai:sciencedirect:download-pdf --doc-id '10.1016/j.heliyon.2024.e28742' --output-dir '/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/downloads/sciencedirect' --unpaywall-email 'unpaywall-test@noeticmind.dev' --output-json > '.runs/path-c-unpaywall/livesmoke/sciencedirect-resmoke.json' 2> '.runs/path-c-unpaywall/livesmoke/sciencedirect-resmoke.stderr'
echo rc=$? >> .runs/path-c-unpaywall/livesmoke/sciencedirect-resmoke.stderr
