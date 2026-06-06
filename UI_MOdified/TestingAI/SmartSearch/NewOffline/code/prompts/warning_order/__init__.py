"""prompts/warning_order — الأمر الإنذاري (Warning Order) Y-approved surface.

Canonical output shape comes from
``/Users/hextechkraken/Desktop/y/WarningOrderJson.rtf`` — 50 flat fields.
The Pydantic model carries the user's inline descriptions (the text
that followed each ``"": ""`` in the reference JSON) as
``Field(description=...)`` strings so structured-output extraction gets
explicit per-field guidance.
"""
