# Bruno API Collection

Exploratory testing collection for Platform Quality Lab services.

## Setup

1. Install [Bruno](https://www.usebruno.com/)
2. Open Bruno → Open Collection → select `bruno-collection/` folder
3. Choose environment from dropdown: `local` or `kind`

## Environments

| Environment | When to use |
|-------------|-------------|
| `local` | Services running via `npm run dev` (ports 3000/3001/3002) |
| `kind` | Port-forwarded Kind cluster (ports 8080/8081/8082) |

## Structure

```
bruno-collection/
├── environments/
│   ├── local.bru
│   └── kind.bru
├── Service A/
│   ├── Health.bru
│   ├── Ready.bru
│   ├── Get Data.bru
│   └── Classify.bru
├── Service B/
│   ├── Health.bru
│   └── Get Info.bru
├── Service C/
│   ├── Health.bru
│   └── Classify.bru
└── bruno.json
```

## Notes

- **Service C (Classify)** requires Ollama. Use `kind` environment.
- **Service A → Classify** proxies to Service C, same constraint applies.
- All requests include assertions for quick validation.
