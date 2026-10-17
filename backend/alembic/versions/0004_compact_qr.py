"""Project QR mode and permanent codes for existing and future boxes."""

import base64
import secrets

import sqlalchemy as sa

from alembic import op

revision = "0006_compact_qr"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy local databases already have the compact QR schema under revision 0004.
    if "box_qr_codes" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.add_column(
        "projects",
        sa.Column("qr_mode", sa.String(12), nullable=False, server_default="universal"),
    )
    codes = op.create_table(
        "box_qr_codes",
        sa.Column("code", sa.String(20), primary_key=True),
        sa.Column("box_id", sa.Integer(), nullable=True, unique=True),
        sa.ForeignKeyConstraint(["box_id"], ["boxes.id"], ondelete="SET NULL"),
    )
    connection = op.get_bind()
    used = set()
    for box_id in connection.execute(sa.text("SELECT id FROM boxes")).scalars():
        while True:
            code = "MM1:" + base64.b32encode(secrets.token_bytes(10)).decode("ascii")
            if code not in used:
                used.add(code)
                break
        connection.execute(codes.insert().values(code=code, box_id=box_id))


def downgrade() -> None:
    op.drop_table("box_qr_codes")
    op.drop_column("projects", "qr_mode")
