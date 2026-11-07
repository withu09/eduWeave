"""Recognise extractor placeholders before sending them to text-only agents."""
import re


def readable_text(content):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", content)
    text = re.sub(r"<img\b[^>]*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://\S+", " ", text)
    return text.strip()


def has_material_text(content):
    return bool(re.search(r"[\w\u4e00-\u9fff]", readable_text(content)))


NO_TEXT_MESSAGE = "资料中只有图片链接，没有可读取的正文。请先进行文字识别（OCR），再上传可复制文字的 PDF、Word 或 TXT 新版本"
