import io
import zipfile
from townlight_data.public_dataset import PublicField, build_public_dataset


def budget_artifact(row: dict) -> bytes:
    summary = row["reviewed_public_summary"]
    if not summary or not summary.strip():
        raise ValueError("reviewed_public_summary must not be blank")

    fields = [
        PublicField("department", "text", "Department"),
        PublicField("account_code", "text", "Account code"),
        PublicField("description", "text", "Description"),
        PublicField("prior_year_cents", "integer", "Prior year amount in cents"),
        PublicField("proposed_cents", "integer", "Proposed amount in cents"),
        PublicField("fiscal_year", "integer", "Fiscal year"),
    ]

    records = []
    for line in row["lines"]:
        records.append({
            "department": line["department"],
            "account_code": line["account_code"],
            "description": line["description"],
            "prior_year_cents": int(line["prior_year_cents"]),
            "proposed_cents": int(line["proposed_cents"]),
            "fiscal_year": int(row["fiscal_year"]),
        })

    public = build_public_dataset(fields, records)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        for name in ("dataset.csv", "dataset.json", "data-dictionary.json"):
            info = zipfile.ZipInfo(name)
            info.date_time = (1980, 1, 1, 0, 0, 0)
            info.compress_type = zipfile.ZIP_STORED
            zf.writestr(info, public[name])

        info = zipfile.ZipInfo("summary.txt")
        info.date_time = (1980, 1, 1, 0, 0, 0)
        info.compress_type = zipfile.ZIP_STORED
        zf.writestr(info, summary.encode("utf-8"))

    data = buf.getvalue()
    if len(data) > 16 * 1024 * 1024:
        raise ValueError("ZIP exceeds 16 MiB")

    return data
