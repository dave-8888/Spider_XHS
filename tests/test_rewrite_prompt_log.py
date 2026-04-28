import tempfile
import unittest
from pathlib import Path

from collector_service import RewriteService


class RewritePromptLogTests(unittest.TestCase):
    def test_rewrite_log_includes_text_model_prompts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = RewriteService(
                root,
                root,
                {
                    "api_key": "test-key",
                    "topic": "测试主题",
                    "text_system_prompt": "系统提示词内容",
                    "safety_rules": "安全准则内容",
                },
            )
            service._last_text_model_prompts = {
                "system_prompt": "系统提示词内容\n\n【安全准则】\n安全准则内容",
                "user_prompt": "用户提示词内容",
            }
            result = {
                "started_at": "2026-04-28 20:00:00",
                "finished_at": "2026-04-28 20:01:00",
                "mode": "single",
                "note_count": 1,
                "article_count": 1,
                "analysis_path": "ai仿写/爆款分析报告.md",
                "articles_path": "ai仿写/仿写文案.md",
                "image_prompts_path": "ai仿写/图片提示词.md",
                "image_analysis_path": "ai仿写/图片识别结果.md",
                "result_path": "ai仿写/result.json",
                "log_path": "ai仿写/仿写日志.md",
            }

            service._write_rewrite_log(
                root,
                result,
                [{"title": "参考笔记", "note_id": "note-1"}],
                None,
                [{"time": "2026-04-28 20:00:30", "message": "正在请求文本模型"}],
            )

            log_text = (root / "仿写日志.md").read_text(encoding="utf-8")
            self.assertIn("## 文案模型提示词", log_text)
            self.assertIn("### 系统提示词", log_text)
            self.assertIn("系统提示词内容", log_text)
            self.assertIn("安全准则内容", log_text)
            self.assertIn("### 用户提示词", log_text)
            self.assertIn("用户提示词内容", log_text)


if __name__ == "__main__":
    unittest.main()
