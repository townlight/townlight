from .meetings_bridge import legal_record
from townlight_meetings.motion_vote import MotionVoteRepository


def verify_recorded_motion(motion_id, meeting_id, agenda_id) -> list[str]:
    def check(store):
        mid = str(motion_id)
        motion = store.get_motion(mid)
        if motion is None:
            raise ValueError(f"Motion {mid} is not saved")
        if str(motion.meeting_id) != str(meeting_id):
            raise ValueError(f"Motion {mid} does not belong to meeting {meeting_id}")
        if str(motion.agenda_item_id) != str(agenda_id):
            raise ValueError(f"Motion {mid} does not belong to agenda item {agenda_id}")

        for m in store.list_motions(str(meeting_id)):
            if str(getattr(m, "correction_of_id", "")) == mid:
                raise ValueError(f"Motion {mid} has been corrected by motion {m.id}")

        votes = store.list_votes(mid)
        superseded = {
            str(v.correction_of_id)
            for v in votes
            if getattr(v, "correction_of_id", None) is not None
        }
        current = [v for v in votes if str(v.id) not in superseded]
        if not any(str(v.vote).strip().lower() in {"yes", "aye", "for"} for v in current):
            raise ValueError(f"Motion {mid} has no current affirmative vote")
        return sorted(str(v.id) for v in current)

    return legal_record(MotionVoteRepository, check)
