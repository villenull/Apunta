# Clinical-knowledge synthetic fixtures

These identifier-free cases are project-safe acceptance fixtures for the local
clinical-knowledge drafting path. Every person, setting, and detail is
fictional. They are intentionally small and deterministic; they are not a
model-quality evaluation and must not be replaced with exported notes.

The cases cover partial MSE evidence, explicit intervention evidence, abstention
when evidence is absent, and the server's check on the Discussion
subheadings a model writes: her form kept, a lone subheading dropped, and
generic category headings (the retired grouper's) turned back into prose. They run through the
unit tests in `server/src/ai/clinical-knowledge/integration.test.ts` and do not
call a model, read the clinical reference PDFs, or access the database.

