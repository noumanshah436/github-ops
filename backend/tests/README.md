# tests

Offline pytest suite for the backend; GitHub is never called because the client's request methods are mocked.

## Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `test_backend.py` | Covers token storage, masking and `.env` quoting, create-vs-merge token routing, permission fallbacks, GraphQL paging and errors, error-message truncation, CORS, the Swagger redirect and Actions run paging |
