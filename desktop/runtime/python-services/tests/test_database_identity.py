import pytest
import sqlalchemy as sa

from townlight_runtime.database_identity import establish


def test_existing_database_is_refused_without_creating_marker():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE existing_record (content TEXT)"))
        connection.execute(sa.text("INSERT INTO existing_record VALUES ('preserve')"))
    with pytest.raises(RuntimeError, match="fresh database only"):
        establish(engine)
    with engine.connect() as connection:
        assert connection.scalar(sa.text("SELECT content FROM existing_record")) == "preserve"
        assert not sa.inspect(connection).has_table("townlight_runtime_identity")


def test_fresh_identity_allows_retry_and_rejects_invalid_marker():
    engine = sa.create_engine("sqlite://")
    establish(engine)
    establish(engine)
    with engine.begin() as connection:
        connection.execute(sa.text("UPDATE townlight_runtime_identity SET identity='unsupported'"))
    with pytest.raises(RuntimeError, match="Unsupported"):
        establish(engine)
