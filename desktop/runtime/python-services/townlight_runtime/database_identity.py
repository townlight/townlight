"""Refuse adoption of an existing unmarked database before running migrations."""
import sqlalchemy as sa

metadata = sa.MetaData()
identity = sa.Table("townlight_runtime_identity", metadata,
    sa.Column("singleton", sa.Integer, primary_key=True),
    sa.Column("identity", sa.String(80), nullable=False))
CURRENT = "townlight-naming-2026-11"


def establish(engine):
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Serialize initializers without altering pre-existing application data.
            connection.execute(sa.text("SELECT pg_advisory_xact_lock(20261102, 1)"))
        inspector = sa.inspect(connection)
        if inspector.has_table(identity.name):
            rows = connection.execute(sa.select(identity)).mappings().all()
            if len(rows) == 1 and rows[0]["singleton"] == 1 and rows[0]["identity"] == CURRENT:
                return
            raise RuntimeError("Unsupported database identity; no migrations were run.")
        tables = inspector.get_table_names()
        schemas = inspector.get_schema_names() if engine.dialect.name == "postgresql" else []
        application_schemas = [name for name in schemas if name != "public" and name != "information_schema" and not name.startswith("pg_")]
        if tables or application_schemas:
            raise RuntimeError("Existing unmarked database detected. This release supports a fresh database only; no migrations were run and existing data was left unchanged.")
        metadata.create_all(connection)
        connection.execute(identity.insert().values(singleton=1, identity=CURRENT))
