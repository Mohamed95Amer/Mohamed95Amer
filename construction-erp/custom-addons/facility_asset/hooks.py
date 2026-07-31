"""Installation hooks for secure physical asset identities."""


def pre_init_secure_asset_tags(env):
    """Make legacy tag tokens unique before the ORM adds the constraint."""
    env.cr.execute(
        """
        ALTER TABLE maintenance_equipment
        ADD COLUMN IF NOT EXISTS tag_token varchar
        """
    )
    env.cr.execute(
        """
        WITH ranked AS (
            SELECT id,
                   tag_token,
                   row_number() OVER (
                       PARTITION BY tag_token
                       ORDER BY id
                   ) AS duplicate_number
              FROM maintenance_equipment
        )
        UPDATE maintenance_equipment AS equipment
           SET tag_token = md5(
               random()::text
               || clock_timestamp()::text
               || equipment.id::text
           )
          FROM ranked
         WHERE ranked.id = equipment.id
           AND (
               equipment.tag_token IS NULL
               OR equipment.tag_token = ''
               OR ranked.duplicate_number > 1
           )
        """
    )
