# Bulk Image Generation — Kie AI Nano Banana 2

## Objective
Generate images in bulk from a list of prompts using the Kie AI Nano Banana 2 model. Prompts are provided via CSV or TXT file, submitted concurrently, polled for completion, and downloaded to local storage.

## Prerequisites
- Python 3.8+
- `requests` and `python-dotenv` installed (`pip install requests python-dotenv`)
- Valid `KIE_API_KEY` set in `.env`

## Input Format

### CSV (recommended)
Must have a `prompt` column. Optional columns: `aspect_ratio`, `resolution`, `output_format`.

```csv
prompt,aspect_ratio,resolution,output_format
"A sunset over mountains",16:9,2K,jpg
"A cat wearing a top hat",1:1,1K,png
```

### TXT
One prompt per line. Uses default settings (1:1, 1K, png).

```
A sunset over mountains
A cat wearing a top hat
```

### Valid Values
| Field | Options | Default |
|-------|---------|---------|
| aspect_ratio | 1:1, 2:3, 3:2, 4:3, 9:16, 16:9, 21:9, auto | 1:1 |
| resolution | 1K, 2K, 4K | 1K |
| output_format | jpg, png | png |

## Execution Steps

### 1. Validate input
```bash
python tools/bulk_generate.py -i input/prompts.csv --dry-run
```

### 2. Run generation
```bash
python tools/bulk_generate.py -i input/prompts.csv -o output/ -c 3
```

### 3. Check results
- Generated images are saved to the output directory
- Failed prompts are written to `output/_failures.csv` (can be re-fed as input)
- Run state is saved to `.tmp/run_state.json`

## CLI Arguments

| Arg | Default | Description |
|-----|---------|-------------|
| `-i/--input` | required | CSV or TXT file path |
| `-o/--output` | `output/` | Output directory |
| `-c/--concurrency` | `3` | Max parallel tasks |
| `--aspect-ratio` | — | Override all rows |
| `--resolution` | — | Override all rows |
| `--format` | — | Override all rows |
| `--skip-errors` | `False` | Continue on failures |
| `--dry-run` | `False` | Validate only |

## Error Handling

| Code | Exception | Meaning | Action |
|------|-----------|---------|--------|
| 401 | KieAuthError | Invalid API key | Check `.env` — verify `KIE_API_KEY` is correct |
| 402 | KieNoCreditsError | No credits left | Top up account at kie.ai |
| 429 | KieRateLimitError | Rate limited | Auto-retried 3× with backoff. If persistent, reduce `-c` |
| 501 | KieGenerationError | Generation failed | Prompt may be blocked or model error. Check prompt content |
| timeout | KieGenerationError | Task didn't complete | Increase timeout or retry. Default is 120s |

## Known Constraints
- **Image URL expiration**: Download URLs from Kie AI are temporary. Images must be downloaded promptly after generation completes.
- **Rate limits**: The API enforces rate limits. The tool retries 429s automatically, but heavy concurrency may still trigger limits. Start with `-c 3` and adjust.
- **Prompt content**: Some prompts may be rejected by content filters. These will appear in `_failures.csv`.

## Tools Used
- `tools/kie_api.py` — Low-level API client (create task, poll, download)
- `tools/validate_input.py` — Input file validation
- `tools/bulk_generate.py` — Main CLI entry point
