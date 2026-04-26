def route_task(input_text: str):
    text = input_text.lower()

    if "calculate" in text:
        return "calculation"

    if "contract" in text or "legal" in text:
        return "legal"

    if "blog" in text or "write" in text:
        return "content"

    return "general"
