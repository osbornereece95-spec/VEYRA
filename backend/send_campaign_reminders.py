"""Daily VEYRA campaign deadline push reminders."""

import main


def run_campaign_reminders():
    reminders_attempted = 0

    with main.connect_db() as db:
        for days_remaining in (3, 1):
            campaigns = db.execute(
                """
                SELECT
                    c.id,
                    c.name,
                    ARRAY_AGG(cc.user_id ORDER BY cc.user_id) AS creator_ids
                FROM management_campaigns c
                JOIN management_campaign_creators cc
                    ON cc.campaign_id = c.id
                WHERE c.status = 'active'
                  AND c.end_date = CURRENT_DATE + %s
                GROUP BY c.id, c.name
                """,
                (days_remaining,),
            ).fetchall()

            for campaign in campaigns:
                creator_ids = campaign["creator_ids"] or []
                if not creator_ids:
                    continue

                if days_remaining == 3:
                    message = (
                        f"{campaign['name']} ends in 3 days. "
                        "Complete any outstanding campaign tasks."
                    )
                else:
                    message = (
                        f"{campaign['name']} ends tomorrow. "
                        "Complete any outstanding campaign tasks."
                    )

                main.send_creator_push_notifications(
                    creator_ids,
                    "reminders",
                    f"campaign-deadline-{campaign['id']}-{days_remaining}-days",
                    "Campaign deadline approaching",
                    message,
                    target_url="/?veyra_tab=Events",
                )

                reminders_attempted += len(creator_ids)

    print(
        "VEYRA reminder run complete. "
        f"Eligible creator deliveries attempted: {reminders_attempted}"
    )


if __name__ == "__main__":
    run_campaign_reminders()
