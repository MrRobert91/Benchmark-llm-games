# Replay responses and provider reasoning

The replay now shows the recorded response, readable provider reasoning, full request
messages, reasoning configuration, served model, provider, token count and retry sequence
for each player and round. Text is not truncated: long sections scroll. Users can select
already revealed rounds and filter players; the final replay exposes all recorded rounds.
Failed terminal web runs also retain their captured attempts. Ongoing runs do not expose
these traces: the backend returns 409 until the run is completed or failed.

This is recorded provider evidence, not guaranteed access to a model's entire internal
process. Returned summaries are labelled where the provider identifies them as summaries.
Missing reasoning is explicit, including when reasoning tokens exist without text. Encrypted
reasoning blocks are counted but cannot be read and are not copied into the viewer.
Duplicate text returned in both `reasoning` and `reasoning_details` is displayed once.

`GET /api/games/{game_id}/traces` on the backend reads the captured SQLite provider calls.
Its allowlist excludes arbitrary transport fields, headers, credentials and ciphertext.
The same-origin frontend route uses these records or the bundled campaign traces when
the backend is unavailable or an older deployment only contains compact provider metadata.
There are no new OpenRouter calls, changes to model settings or changes to frozen results.

The 489 research replay sidecars in `frontend/public/data/traces` are derived from the
original downloadable campaign archive, not synthetic explanations. Regenerate them with:

```sh
cd backend
python -m tools.export_replay_traces
```

Old replays without captured text show that evidence is unavailable. The static sidecars
preserve every attempt for these campaign races; the frozen archive remains unchanged and
retains the original encrypted records. New web executions already store full provider
traces in SQLite and need no migration or new export step to use the viewer.
