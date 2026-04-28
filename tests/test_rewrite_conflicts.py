import unittest
import json
import threading
from http.server import ThreadingHTTPServer
from urllib import error as urlerror
from urllib import request as urlrequest
from unittest.mock import Mock, patch

from collector_service import (
    REWRITE_PREVIEW_TOPIC_SOURCE,
    detect_rewrite_requirement_conflicts,
)
from web_app import AppHandler, RewriteRequirementConflictError, run_manual_rewrite_job


class RewriteRequirementConflictTests(unittest.TestCase):
    def test_location_conflict_between_popup_and_default_requirement(self) -> None:
        conflicts = detect_rewrite_requirement_conflicts(
            "主题：新活动\n地点：上海",
            {
                "topic": "主题：创业沙龙\n地点：北京国润大厦",
                "creator_profile": {},
            },
        )

        self.assertTrue(any(item["field"] == "地点" for item in conflicts))

    def test_generic_popup_warns_when_profile_has_fixed_activity_info(self) -> None:
        conflicts = detect_rewrite_requirement_conflicts(
            "直接仿写一篇，吸引用户点赞的文章",
            {
                "topic": "创业沙龙",
                "creator_profile": {
                    "business_context": "核心业务是创业沙龙、创业搭子交流和线下资源链接。",
                    "conversion_goal": "引导用户评论关键词、私信咨询或报名线下创业沙龙。",
                },
            },
        )

        self.assertTrue(any(item["field"] == "旧画像信息" for item in conflicts))

    def test_matching_popup_requirement_has_no_conflict(self) -> None:
        conflicts = detect_rewrite_requirement_conflicts(
            "主题：创业沙龙\n时间：本周日下午2点到6点\n地点：北京国润大厦",
            {
                "topic": "主题：创业沙龙\n时间：本周日下午2点到6点\n地点：北京国润大厦",
                "creator_profile": {
                    "business_context": "主题：创业沙龙\n地点：北京国润大厦",
                },
            },
        )

        self.assertEqual(conflicts, [])


class RewriteJobConflictApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "rewrite": {
                "topic": "主题：创业沙龙\n地点：北京国润大厦",
                "creator_profile": {
                    "business_context": "核心业务是创业沙龙、创业搭子交流和线下资源链接。",
                },
            },
            "memory": {},
        }

    def test_unconfirmed_preview_conflict_does_not_start_job(self) -> None:
        start_rewrite = Mock()
        with patch("web_app.config_store.load", return_value=self.config), patch(
            "web_app.job_manager.start_rewrite",
            start_rewrite,
        ):
            with self.assertRaises(RewriteRequirementConflictError):
                run_manual_rewrite_job({
                    "targets": [{"path": "note.md", "name": "note.md"}],
                    "topic": "地点：上海",
                    "topic_source": REWRITE_PREVIEW_TOPIC_SOURCE,
                })

        start_rewrite.assert_not_called()

    def test_confirmed_preview_conflict_starts_job_with_topic_source(self) -> None:
        start_rewrite = Mock(return_value={"id": "job-test"})
        with patch("web_app.config_store.load", return_value=self.config), patch(
            "web_app.job_manager.start_rewrite",
            start_rewrite,
        ):
            result = run_manual_rewrite_job({
                "targets": [{"path": "note.md", "name": "note.md"}],
                "topic": "地点：上海",
                "topic_source": REWRITE_PREVIEW_TOPIC_SOURCE,
                "confirmed_conflicts": True,
            })

        self.assertEqual(result["id"], "job-test")
        passed_config = start_rewrite.call_args.kwargs["config"]
        self.assertEqual(passed_config["rewrite"]["_topic_source"], REWRITE_PREVIEW_TOPIC_SOURCE)


class RewriteJobHttpConflictApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "rewrite": {
                "topic": "主题：创业沙龙\n地点：北京国润大厦",
                "creator_profile": {
                    "business_context": "核心业务是创业沙龙、创业搭子交流和线下资源链接。",
                },
            },
            "memory": {},
        }

    def request_rewrite_job(self, payload: dict) -> tuple[int, dict]:
        server = ThreadingHTTPServer(("127.0.0.1", 0), AppHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            body = json.dumps(payload).encode("utf-8")
            request = urlrequest.Request(
                f"http://127.0.0.1:{server.server_address[1]}/api/rewrite-job",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlrequest.urlopen(request, timeout=5) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urlerror.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode("utf-8"))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_http_unconfirmed_preview_conflict_returns_409(self) -> None:
        start_rewrite = Mock()
        with patch("web_app.config_store.load", return_value=self.config), patch(
            "web_app.job_manager.start_rewrite",
            start_rewrite,
        ):
            status, payload = self.request_rewrite_job({
                "targets": [{"path": "note.md", "name": "note.md"}],
                "topic": "地点：上海",
                "topic_source": REWRITE_PREVIEW_TOPIC_SOURCE,
            })

        self.assertEqual(status, 409)
        self.assertFalse(payload["success"])
        self.assertTrue(payload["conflicts"])
        start_rewrite.assert_not_called()

    def test_http_confirmed_preview_conflict_returns_job(self) -> None:
        start_rewrite = Mock(return_value={"id": "job-test"})
        with patch("web_app.config_store.load", return_value=self.config), patch(
            "web_app.job_manager.start_rewrite",
            start_rewrite,
        ):
            status, payload = self.request_rewrite_job({
                "targets": [{"path": "note.md", "name": "note.md"}],
                "topic": "地点：上海",
                "topic_source": REWRITE_PREVIEW_TOPIC_SOURCE,
                "confirmed_conflicts": True,
            })

        self.assertEqual(status, 200)
        self.assertEqual(payload["job"]["id"], "job-test")
        self.assertTrue(payload["success"])


if __name__ == "__main__":
    unittest.main()
