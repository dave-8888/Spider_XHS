import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import Mock, patch

from collector_service import (
    DEFAULT_REWRITE_SAFETY_RULES,
    DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE,
    JobManager,
    RewriteService,
    fetch_model_catalog,
    migrate_rewrite_prompt_template,
    migrate_rewrite_safety_rules,
    normalize_models_url,
    resolve_rewrite_model_config,
)


class RewritePromptLogTests(unittest.TestCase):
    def test_default_rewrite_prompt_config_matches_runtime_constants(self) -> None:
        config_path = Path(__file__).resolve().parents[1] / "config" / "default_config.json"
        rewrite_config = json.loads(config_path.read_text(encoding="utf-8"))["rewrite"]

        self.assertEqual(rewrite_config["safety_rules"], DEFAULT_REWRITE_SAFETY_RULES)
        self.assertEqual(
            rewrite_config["text_user_prompt_template"],
            DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE,
        )
        self.assertIn("【优先级规则】", DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE)
        self.assertIn("本次仿写要求优先于创作画像", DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE)
        self.assertIn("不要编造具体人数", DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE)
        self.assertNotIn("含自然转化引导", DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE)

    def test_legacy_default_rewrite_prompt_migrates_to_layered_template(self) -> None:
        legacy_template = (
            "请基于以下小红书爆款样本做爆款拆解，并根据{{仿写要求}}生成仿写文案。"
            "最终文案要先像创作画像里的用户，再吸收参考笔记的爆款结构；"
            "每篇最终文案必须符合{{仿写要求}}；"
            "{\"body\":\"完整小红书正文，含自然转化引导\"}"
        )

        self.assertEqual(
            migrate_rewrite_prompt_template(legacy_template, "text_user_prompt_template"),
            DEFAULT_REWRITE_TEXT_USER_PROMPT_TEMPLATE,
        )

    def test_legacy_safety_rules_gain_fake_detail_guard(self) -> None:
        legacy_rules = "只学习结构、节奏、选题角度和视觉风格。输入没有明确提供时不要编造，可以用中性占位或省略。"

        migrated = migrate_rewrite_safety_rules(legacy_rules)

        self.assertIn("信息组织方式", migrated)
        self.assertIn("不要用具体数字、具体身份、具体结果伪造真实细节", migrated)
        self.assertNotIn("可以用中性占位或省略", migrated)

    def test_legacy_model_config_resolves_to_dashscope_defaults(self) -> None:
        rewrite = {
            "api_key": "legacy-key",
            "text_model": "qwen-plus",
            "vision_model": "qwen3-vl-plus",
            "image_model": "wan2.6-image",
            "region": "ap-southeast-1",
        }

        text = resolve_rewrite_model_config(rewrite, "text")
        vision = resolve_rewrite_model_config(rewrite, "vision")
        image = resolve_rewrite_model_config(rewrite, "image")

        self.assertEqual(text["provider"], "dashscope")
        self.assertEqual(text["api_key"], "legacy-key")
        self.assertEqual(text["chat_endpoint"], "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions")
        self.assertEqual(vision["model"], "qwen3-vl-plus")
        self.assertEqual(image["image_endpoint"], "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image-generation/generation")

    def test_scoped_model_override_does_not_affect_text_config(self) -> None:
        rewrite = {
            "provider_preset": "dashscope",
            "api_key": "shared-key",
            "text_model": "qwen-plus",
            "vision_provider_preset": "openai",
            "vision_base_url": "https://api.openai.com/v1/",
            "vision_api_key": "vision-key",
            "vision_model": "gpt-4.1-mini",
        }

        text = resolve_rewrite_model_config(rewrite, "text")
        vision = resolve_rewrite_model_config(rewrite, "vision")

        self.assertEqual(text["provider"], "dashscope")
        self.assertEqual(text["api_key"], "shared-key")
        self.assertEqual(vision["provider"], "openai")
        self.assertEqual(vision["api_key"], "vision-key")
        self.assertEqual(vision["chat_endpoint"], "https://api.openai.com/v1/chat/completions")

    def test_models_url_normalizes_chat_completion_url(self) -> None:
        self.assertEqual(
            normalize_models_url("https://api.example.com/v1/chat/completions", "custom"),
            "https://api.example.com/v1/models",
        )

    def test_deepseek_provider_resolves_openai_compatible_defaults(self) -> None:
        rewrite = {
            "provider_preset": "deepseek",
            "api_key": "deepseek-key",
        }

        text = resolve_rewrite_model_config(rewrite, "text")

        self.assertEqual(text["provider"], "deepseek")
        self.assertEqual(text["provider_label"], "DeepSeek")
        self.assertEqual(text["model"], "deepseek-v4-flash")
        self.assertEqual(text["base_url"], "https://api.deepseek.com")
        self.assertEqual(text["chat_endpoint"], "https://api.deepseek.com/chat/completions")
        self.assertEqual(text["models_endpoint"], "https://api.deepseek.com/models")

    def test_missing_model_key_error_is_provider_neutral(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {}, clear=True):
                service = RewriteService(Path(tmp), Path(tmp), {"api_key": ""})
                with self.assertRaisesRegex(RuntimeError, "缺少文本模型 API Key"):
                    service._require_model_key("text")

    def test_model_catalog_fetch_parses_openai_compatible_models(self) -> None:
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            "data": [
                {"id": "gpt-test", "description": "A text model."},
                {"id": "vision-test", "architecture": {"input_modalities": ["text", "image"]}},
            ]
        }
        response.raise_for_status = Mock()

        with patch("collector_service.requests.get", return_value=response) as get:
            result = fetch_model_catalog(
                {
                    "scope": "text",
                    "provider_preset": "custom",
                    "base_url": "https://api.example.com/v1/chat/completions",
                    "api_key": "key",
                },
                {"rewrite": {}},
            )

        get.assert_called_once()
        self.assertEqual(get.call_args.args[0], "https://api.example.com/v1/models")
        self.assertEqual([item["id"] for item in result["models"]], ["gpt-test", "vision-test"])
        self.assertIn("multimodal", result["models"][1]["groups"])

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
            self.assertEqual(
                service._text_prompts_payload(),
                {
                    "system_prompt": "系统提示词内容\n\n【安全准则】\n安全准则内容",
                    "user_prompt": "用户提示词内容",
                },
            )
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

    def test_job_manager_can_backfill_prompts_from_rewrite_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "仿写日志.md"
            log_path.write_text(
                "\n".join([
                    "# 测试 仿写日志",
                    "",
                    "## 文案模型提示词",
                    "",
                    "### 系统提示词",
                    "",
                    "```text",
                    "系统提示词内容",
                    "```",
                    "",
                    "### 用户提示词",
                    "",
                    "```text",
                    "用户提示词内容",
                    "```",
                    "",
                    "## 输出文件",
                ]),
                encoding="utf-8",
            )
            manager = object.__new__(JobManager)

            self.assertEqual(
                manager._text_prompts_from_rewrite_log(log_path),
                {
                    "system_prompt": "系统提示词内容",
                    "user_prompt": "用户提示词内容",
                },
            )


if __name__ == "__main__":
    unittest.main()
