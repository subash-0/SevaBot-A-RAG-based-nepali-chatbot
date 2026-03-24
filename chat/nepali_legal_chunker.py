"""
Nepali Legal Document Chunker — v3 for SevaBot RAG
====================================================
Handles: Constitution, Civil Code, Citizenship Act, Passport Rules,
         Foreign Affairs, and any Nepal Gazette legal instrument.

Root causes of garbled text addressed in this version
------------------------------------------------------
1.  SHORT-I MATRA (ि U+093F) AT WORD-BOUNDARY
    The Preeti font maps several consonants (व, ह, भ) to positions that
    the converter emits as a bare short-i matra.  Result: words that
    should start with व/ह/भ appear to start with ि.
    Fix: word-level string replacements (most reliable for Nepali legal vocab).

2.  REPH (र्) DISPLACEMENT — व्र् → व्य
    The "reph" (र् above a consonant) and the following ya-phalaa get
    swapped/dropped, turning व्यवहार into व्र्ििार.
    Fix: regex  व्र् → व्य  plus downstream i-matra fixes.

3.  म + CONSONANT → CONSONANT + ि   (i-matra left-shift)
    पति comes out as पमत, निकाय as मनकाय, महिला as मविला.
    Fix: ordered string replacements (longer before shorter).

4.  श + ि  →  ख + ि   (sha+short-i decoded as kha+short-i)
    लेखिएको → लेशिएको, राखिएको → राशिएको, देखि → देशि.
    Fix: targeted regex + string replacements.

5.  ठद  →  दि   (Retroflex-Tha + Da decoded instead of Da+short-i)
    दिनु → ठदनु, दिएको → ठदएको.
    Fix: global  ठद → दि.

6.  र् + CONSONANT ONSET ARTIFACTS
    र्स → यस, र्स्तो → त्यस्तो, र्थप → थप.
    Fix: ordered regex with word boundaries.

7.  VERB ENDINGS
    गर्नुहुँदैन → गनयिुाँदैन / गनुयिुाँदैन.
    Fix: targeted string replacement.

8.  PyMuPDF plain "text" mode ignores reading order in multi-column Gazette.
    Fix: use "dict" block mode — join spans in visual/logical order.

9.  Preeti conversion ran on every page even for already-Unicode PDFs.
    Fix: quality-gate; only call preeti_unicode when raw quality score is low.

10. Token estimator  len//4  is too optimistic for Devanagari syllables.
    Fix: count Devanagari syllable clusters instead.

Dependencies
------------
    pip install pymupdf preeti-unicode
"""

from __future__ import annotations

import fitz          # PyMuPDF
import preeti_unicode
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Unicode constants
# ─────────────────────────────────────────────────────────────────────────────

_DEV_LO  = "\u0900"
_DEV_HI  = "\u097F"
HALANTA  = "्"        # U+094D
ZWJ      = "\u200d"
ZWNJ     = "\u200c"

HALANTA_KEEPERS = frozenset({
    "अर्थात्", "सम्भवत्", "किञ्चित्", "कदाचित्", "परिषद्",
    "विद्वान्", "पश्चात्", "सम्राट्", "हठात्", "तत्", "सत्",
    "जगत्", "महत्", "भगवत्",
})

_INTRO  = "__INTRO__"
_HEADER = "__HEADER__"


# ─────────────────────────────────────────────────────────────────────────────
# Parser state
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class _State:
    part:     str = ""
    chapter:  str = "Unknown"
    anchor:   str = _INTRO
    upa_dafa: Optional[str] = None
    lines:    List[str] = field(default_factory=list)
    page_idx: int = 1


# ─────────────────────────────────────────────────────────────────────────────
# Compiled patterns  (built once at import)
# ─────────────────────────────────────────────────────────────────────────────

class _P:
    # Structural headings
    PART     = re.compile(r"^\s*भाग\s*([\u0966-\u096F]+)(?:\s*[–—:\-]\s*(.{0,120}))?\s*$")
    CHAPTER  = re.compile(r"^\s*परिच्छेद\s*[–\-—]\s*([\u0966-\u096F]+)")
    SCHEDULE = re.compile(r"^\s*अनुसूची\s*(?:[–—:\-]\s*)?([\u0966-\u096F]+)?(?:\s*\(([^)]{1,100})\))?\s*$")

    # Primary legal anchors — checked in this order (most specific first)
    ANCHORS: List[Tuple[str, "re.Pattern[str]", int]] = [
        ("धारा", re.compile(r"^\s*धारा\s+([\u0966-\u096F]+(?:\s*\([\u0966-\u096F]+\))?)"), 1),
        ("दफा",  re.compile(r"^\s*दफा\s+([\u0966-\u096F]+)"),                               1),
        ("नियम", re.compile(r"^\s*नियम\s+([\u0966-\u096F]+(?:\s*\([\u0966-\u096F]+\))?)"),  1),
        # Bare Nepali-numeral section: "५८८. …"
        ("§",    re.compile(r"^\s*([\u0966-\u096F]{1,4})\.\s+\S"),                           1),
    ]

    # Sub-section anchors
    UPA_DAFA  = re.compile(r"^\s*(?:उपदफा\s+)?\(([\u0966-\u096F]+)\)")
    UPA_NIYAM = re.compile(r"^\s*उपनियम\s*(?:\(([\u0966-\u096F]+)\)|([\u0966-\u096F]+))")

    # Noise-line detection
    DATE_LINE   = re.compile(r"^\s*[\d\u0966-\u096F]{4}\s*[./।]\s*[\d\u0966-\u096F]{1,2}\s*[./।]\s*[\d\u0966-\u096F]{1,2}\s*$")
    NEPALI_YEAR = re.compile(r"[\u0966-\u096F\d]{3,4}\s*साल\s*.+\s*गते")
    GAZETTE_HDR = re.compile(r"खण्ड\s*[\u0966-\u096F\d]+\s*,?\s*संख्या\s*[\u0966-\u096F\d]+")
    PAGE_NUM    = re.compile(r"^\s*[\u0966-\u096F]+\s*$")
    FOOTER_PG   = re.compile(r"^(?:पाना|पृष्ठ)\s*[\u0966-\u096F\d]+$")
    GARBAGE_TOK = re.compile(r"(?:धधध|बिधअयफफष्ककष्यल|नयख|एबककउयचत|एभचफबलभलत|ब्ममचभककस|घद्द)", re.I)
    GAZETTE_BDY = re.compile(r"(?:नेपाल\s*राजपत्र|राजपत्रमा\s*प्रकाशित|नेपाल\s*सरकार|www\.|lawcommission)", re.I)
    LEGAL_ANCHOR= re.compile(r"दफा|धारा|नियम|उपनियम|परिच्छेद|भाग\s*[\u0966-\u096F]+")

    # Normalisation helpers
    SYMBOL_NOISE  = re.compile(r"[•●◆■□▶◄►◊]")
    CONV_PAREN    = re.compile(r"९\s*([^\s९०]{1,30})\s*०")
    MULTI_DANDA   = re.compile(r"[।॥]{2,}")
    MULTI_WS      = re.compile(r"[ \t]{2,}")
    REPEAT_PUNCT  = re.compile(r"([,;:])\1+")
    DANDA_SPC     = re.compile(r"\s*।\s*")
    HALANTA_END   = re.compile(r"([\u0900-\u097F]+्)(?=[\s,।\)])")
    HALF_JOIN     = re.compile(r"([\u0915-\u0939]्)\s+([\u0900-\u097F])")
    MATRA_JOIN    = re.compile(r"([\u0900-\u097F])\s+([\u093e-\u094d])")
    LONG_TOK      = re.compile(r"\S{35,}")

    # Metadata extraction
    SHORT_TITLE = re.compile(r"(?:संक्षिप्त\s*नाम|छोटो\s*नाम)\s*[:।\-–]?\s*(.{4,220})$")
    COMMENCE    = re.compile(r"(?:प्रारम्भ|प्रारंभ|लागू\s*हुने\s*मिति|प्रवर्तन)\s*[:।\-–]?\s*(.{3,220})$")

    # Compound-word structural repairs
    COMPOUNDS: List[Tuple["re.Pattern[str]", str]] = [
        (re.compile(r"प्र\s+स्था\s*वना"),   "प्रस्तावना"),
        (re.compile(r"सं\s*विधान"),          "संविधान"),
        (re.compile(r"उप\s+नियम"),           "उपनियम"),
        (re.compile(r"नागर\s*ि\s*कता"),      "नागरिकता"),
        (re.compile(r"रा\s*ह\s*दानी"),       "राहदानी"),
        (re.compile(r"राह\s+दानी"),          "राहदानी"),
        (re.compile(r"नागर\s*ि\s*क\b"),      "नागरिक"),
    ]

    # Regex-level corruption rules.
    # ORDER MATTERS — more specific / longer patterns FIRST.
    # Pre-regex string fixes for patterns that would be clobbered by generic
    # regexes are applied in _apply_regex_corrections() before these fire.
    CORRUPTION_REGEX: List[Tuple["re.Pattern[str]", str]] = [
        # 1. व्र् → व्य  (reph displacement — most common class)
        #    Note: specific words like व्र्शि, व्र्ििार are handled by
        #    pre-regex string fixes to avoid sha→kha collision.
        (re.compile(r"व्र्"),                              "व्य"),
        # 2. Post-regex residue cleanup (after व्र्→व्य fires)
        (re.compile(r"व्यशि"),                             "व्यक्ति"),
        (re.compile(r"व्यििार"),                           "व्यवहार"),
        (re.compile(r"व्यिस्था"),                          "व्यवस्था"),
        (re.compile(r"व्यिसाय"),                           "व्यवसाय"),
        # 3. Nepali-word + िषय → word + " वर्ष"  (e.g. तीनिषय → तीन वर्ष)
        (re.compile(r"([\u0900-\u097F]+)िषय"),             r"\1 वर्ष"),
        # 4. Nepali-word + िजार → word + " हजार"  (e.g. तीसिजार → तीस हजार)
        (re.compile(r"([\u0900-\u097F]+)िजार"),            r"\1 हजार"),
        # 5. कैदिा → कैद वा  (imprisonment 'or' fine — very common penal pattern)
        (re.compile(r"कैदिा"),                             "कैद वा"),
        # 6. Standalone िा particle → वा  (legal 'or'/'and' connector)
        (re.compile(r"(?<=[\u0900-\u097F])\s+िा\s+(?=[\u0900-\u097F])"), " वा "),
        # 7. र्+ word-onset artifacts
        (re.compile(r"र्स्तै\b"),                          "त्यस्तै"),
        (re.compile(r"र्स्ता\b"),                          "त्यस्ता"),
        (re.compile(r"र्स्तो\b"),                          "त्यस्तो"),
        (re.compile(r"\bर्स\b"),                           "यस"),
        (re.compile(r"\bर्थप\b"),                          "थप"),
        (re.compile(r"र्स संहिता"),                        "यस संहिता"),
        (re.compile(r"र्स दफा"),                           "यस दफा"),
        (re.compile(r"र्स ऐन"),                            "यस ऐन"),
        (re.compile(r"र्स नियम"),                          "यस नियम"),
        # 8. ठद → दि  (Retroflex-Tha + Da artifact)
        (re.compile(r"ठद"),                                "दि"),
        # 9. Verb endings
        (re.compile(r"गनयिुाँ"),                           "गर्नुहुँ"),
        (re.compile(r"गनुयिुाँ"),                          "गर्नुहुँ"),
        (re.compile(r"गनयिु"),                             "गर्नुहु"),
        (re.compile(r"गनुयि"),                             "गर्नुहि"),
        # 10. Prohibitory suffix
        (re.compile(r"िुाँदैन"),                           "हुँदैन"),
        (re.compile(r"िुँदैन"),                            "हुँदैन"),
        # 11. Sha+short-i → kha+short-i scoped to known verb/noun stems
        (re.compile(r"लेशि"),                              "लेखि"),
        (re.compile(r"राशि"),                              "राखि"),
        (re.compile(r"देशि"),                              "देखि"),
        (re.compile(r"पेशि"),                              "पेखि"),
        (re.compile(r"बोलाशि"),                            "बोलाखि"),
        # 12. जश → शि  (ja+sha artifact for शिक्षा)
        (re.compile(r"जशक्षा"),                            "शिक्षा"),
        (re.compile(r"जशिा"),                              "शिक्षा"),
        # 13. Separation term
        (re.compile(r"मिन्निएमा"),                         "छुट्टिएमा"),
        (re.compile(r"मिन्नि"),                            "छुट्टि"),
        # 14. संर्ो → संयो
        (re.compile(r"संर्ो"),                             "संयो"),
        # 15. Noise tokens
        (re.compile(r"\bघद्द\b"),                          ""),
        # 16. िण्ड → खण्ड  (only standalone, not inside अंशबण्डा)
        #     Negative lookbehind prevents matching inside "अंशिण्डा"
        #     (which is handled by pre-regex string fix)
        (re.compile(r"(?<!अंश)(?<!ब)\bिण्ड\b"),            "खण्ड"),
    ]

    # Pre-regex string fixes: sequences that MUST be resolved before the
    # generic regex rules fire (to prevent partial/wrong matches).
    PRE_REGEX_FIXES: List[Tuple[str, str]] = [
        ("अंशिण्डा",  "अंशबण्डा"),   # must precede िण्ड→खण्ड regex
        ("अंशिण्ड",   "अंशबण्ड"),
        ("व्र्शि",    "व्यक्ति"),    # must precede व्र्→व्य (avoids sha→kha)
        ("व्र्ििार",  "व्यवहार"),   # must precede व्र्→व्य
        ("व्र्िस्था", "व्यवस्था"),   # must precede व्र्→व्य
        ("व्र्िसाय",  "व्यवसाय"),
    ]


P = _P()   # singleton


# ─────────────────────────────────────────────────────────────────────────────
# String-level artifact replacement table
# Ordered: longer / more specific entries FIRST to avoid partial clobbering
# ─────────────────────────────────────────────────────────────────────────────

_STR_REPLACEMENTS: List[Tuple[str, str]] = [
    # Invisible chars
    (ZWJ,  ""),
    (ZWNJ, ""),
    # Encoding artifacts
    ("\uf0aa", " "),  ("\uf0a7", " "),
    ("¥",  "र्"),
    ("ª",  "ङ"),
    ("Ë",  "ङ्ग"),
    ("§",  "ट्ट"),
    ("æ",  '"'),
    ("Æ",  '"'),

    # Garble fragments (exact strings, longest first)
    ("धधध।बिधअयफफष्ककष्यल।नयख।लउ", ""),
    ("घद्द", ""),

    # ── भेदभाव family ────────────────────────────────────────────────────────
    ("िेदिािपूणय",     "भेदभावपूर्ण"),
    ("िेदिाि",         "भेदभाव"),
    ("िेदिािकारी",     "भेदभावकारी"),

    # ── व्यक्ति / व्यवहार / व्यवस्था  (string guards after regex pass) ──────
    ("व्र्शि",         "व्यक्ति"),
    ("व्र्ििार",       "व्यवहार"),
    ("व्र्िस्था",      "व्यवस्था"),
    ("व्र्िसाय",       "व्यवसाय"),

    # ── वैवाहिक / वैचारिक ───────────────────────────────────────────────────
    ("िैिाहिक",        "वैवाहिक"),
    ("िैिाहित",        "वैवाहित"),
    ("िैचाररक",        "वैचारिक"),
    ("िैधाशनक",        "वैधानिक"),
    ("िैधाननक",        "वैधानिक"),
    ("िैधता",          "वैधता"),

    # ── वर्ण / वर्ष ──────────────────────────────────────────────────────────
    ("िणय",            "वर्ण"),
    ("िषयसम्म",        "वर्षसम्म"),
    ("िषयको",          "वर्षको"),
    ("िषयमा",          "वर्षमा"),
    ("िषयदेशि",        "वर्षदेखि"),
    ("िषय",            "वर्ष"),

    # ── वंश / वातावरण / वास ──────────────────────────────────────────────────
    ("िंश",            "वंश"),
    ("िातािरण",        "वातावरण"),
    ("िासस्थान",       "वासस्थान"),

    # ── हजार / हुनेछ / हैरान / हेर ──────────────────────────────────────────
    ("िजार",           "हजार"),
    ("िुनेछ",          "हुनेछ"),
    ("िुनु",           "हुनु"),
    ("िुने",           "हुने"),
    ("िुँदैन",         "हुँदैन"),
    ("िुँदा",          "हुँदा"),
    ("िोइन",           "होइन"),
    ("िोस्",           "होस्"),
    ("िैरान",          "हैरान"),
    ("िेरहिचार",       "हेरविचार"),
    ("िेरिमचार",       "हेरविचार"),

    # ── भाषा ─────────────────────────────────────────────────────────────────
    ("िाषा",           "भाषा"),
    ("िाषािार",        "भाषावार"),

    # ── सम्पत्ति (sha+short-i artifact) ────────────────────────────────────
    ("सम्पशिको",       "सम्पत्तिको"),
    ("सम्पशिमा",       "सम्पत्तिमा"),
    ("सम्पशिलाई",      "सम्पत्तिलाई"),
    ("सम्पशि",         "सम्पत्ति"),

    # ── पति / निज (म→consonant i-matra shift) ───────────────────────────────
    ("पमत पत्नी",      "पति पत्नी"),
    ("पमतको",          "पतिको"),
    ("पमतले",          "पतिले"),
    ("पमतलाई",         "पतिलाई"),
    ("पमतसाँग",        "पतिसाँग"),
    ("पमत",            "पति"),
    ("मनकाय",          "निकाय"),
    ("मविलाको",        "महिलाको"),
    ("मविलालाई",       "महिलालाई"),
    ("मविला",          "महिला"),
    ("मनजको",          "निजको"),
    ("मनजले",          "निजले"),
    ("मनजलाई",         "निजलाई"),
    ("मनज",            "निज"),
    ("मनयुशि",         "नियुक्ति"),
    ("मनयुि",          "नियुक्त"),
    ("मनणयय",          "निर्णय"),
    ("मनधायरण",        "निर्धारण"),
    ("मनिायचन",        "निर्वाचन"),
    ("मनिायह",         "निर्वाह"),
    ("मनिायसन",        "निर्वासन"),
    ("मनरोध",          "निरोध"),
    ("मसद्धान्ि",      "सिद्धान्त"),

    # ── अधिकारी / अधिकार ────────────────────────────────────────────────────
    ("अमधकारी",        "अधिकारी"),
    ("अमधकार",         "अधिकार"),
    ("अमधकृत",         "अधिकृत"),
    ("अमधिेशन",        "अधिवेशन"),
    ("अमधमनयम",        "अधिनियम"),

    # ── Common adjectives ────────────────────────────────────────────────────
    ("सामाशजक",        "सामाजिक"),
    ("शारीररक",        "शारीरिक"),
    ("मानमसक",         "मानसिक"),
    ("आमथयक",          "आर्थिक"),
    ("राजनीमतक",       "राजनीतिक"),

    # ── विवाह / बहुविवाह / विवाहित ──────────────────────────────────────────
    ("ििुहििाि",       "बहुविवाह"),
    ("ििुहििाहित",     "बहुविवाहित"),
    ("हििाहित",        "विवाहित"),
    ("हििाहिक",        "विवाहिक"),
    ("हििाि",          "विवाह"),

    # ── Specific legal/constitutional terms ──────────────────────────────────
    ("अंशिण्डा",       "अंशबण्डा"),
    ("अंशिण्ड",        "अंशबण्ड"),
    ("समािेशी",        "समावेशी"),
    ("समािेश",         "समावेश"),
    ("पोर्ण",          "पोषण"),
    ("स्यािार",        "स्याहार"),
    ("जोजखम",          "जोखिम"),
    ("मनोर जनि",       "मनोरञ्जन"),
    ("सिाविीण",        "सर्वाङ्गीण"),
    ("व्यजक्तत्ि",    "व्यक्तित्व"),
    ("प्रारजम्भक",     "प्रारम्भिक"),
    ("शोर्ण",          "शोषण"),
    ("भनाविा",         "भर्ना वा"),
    ("धाममवक",         "धार्मिक"),
    ("धाशमयक",         "धार्मिक"),
    ("वकमसम",          "किसिम"),
    ("समभफदारी",       "सहमतिमा"),
    ("िेशि",           "देखि"),
    ("िाञ्जी",         "काञ्जी"),
    ("बमोशजम",         "बमोजिम"),

    # Older artifact fixes carried over from v1/v2
    ("कुराह्र",        "कुराहरू"),
    ("ह्र",            "हरू"),
    ("ाै",             "ौ"),
    ("एे",             "ऐ"),
    ("लार्इ",          "लाई"),
    ("दावी",           "दाबी"),
    ("देिायका",        "देहायका"),
    ("नियमिरू",        "नियमहरू"),
    ("स्र्ानीय",       "स्थानीय"),
    ("कायाथलय",        "कार्यालय"),
    ("सम्बशन्धत",      "सम्बन्धित"),
    ("शजल्ला",         "जिल्ला"),
    ("प्रनतनलहप",      "प्रतिलिपि"),
    ("नसफारिस",        "सिफारिस"),
    ("इत्यादद",        "इत्यादि"),
    ("उपननयम",         "उपनियम"),
    ("ननवेदन",         "निवेदन"),
    ("ननयमावली",       "नियमावली"),
    ("ननयम",           "नियम"),
    ("प्राप त",        "प्राप्त"),
    ("िाजपत्र",        "राजपत्र"),
    ("िाहदान्ी",       "राहदानी"),
    ("िाहदानी",        "राहदानी"),
    ("रािदानी",        "राहदानी"),
    ("नागर'िकता",      "नागरिकता"),
    ("नागर िकता",      "नागरिकता"),
    ("नागर्ि कता",     "नागरिकता"),
    ("नागर्ि क",       "नागरिक"),
    ("परराष्ट",        "परराष्ट्र"),
    ("पररास्ट्र",      "परराष्ट्र"),
    (" ः", ": "),
    ("ः",  ": "),
]


def _apply_str_replacements(text: str) -> str:
    for wrong, right in _STR_REPLACEMENTS:
        if wrong in text:
            text = text.replace(wrong, right)
    return text


def _apply_regex_corrections(text: str) -> str:
    # Step A: apply pre-regex string fixes for sequences that would be
    # incorrectly clobbered by the generic regexes below.
    for wrong, right in P.PRE_REGEX_FIXES:
        if wrong in text:
            text = text.replace(wrong, right)
    # Step B: ordered regex rules
    for pat, rep in P.CORRUPTION_REGEX:
        text = pat.sub(rep, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Text quality metrics
# ─────────────────────────────────────────────────────────────────────────────

def _nepali_ratio(text: str) -> float:
    if not text:
        return 0.0
    dev = sum(1 for c in text if _DEV_LO <= c <= _DEV_HI)
    return dev / max(len(text), 1)


def _halanta_density(text: str) -> float:
    dev = sum(1 for c in text if _DEV_LO <= c <= _DEV_HI)
    return text.count(HALANTA) / max(dev, 1)


def _cluster_ratio(text: str) -> float:
    """Fraction of Devanagari words with ≥3 halanta signs (garble signal)."""
    words = [w for w in text.split() if _nepali_ratio(w) > 0.5]
    if not words:
        return 0.0
    heavy = sum(1 for w in words if w.count(HALANTA) >= 3)
    return heavy / len(words)


def _text_quality(text: str) -> float:
    if not text:
        return -9999.0
    score  =  _nepali_ratio(text) * 120.0
    score -=  _halanta_density(text) * 80.0
    score -=  _cluster_ratio(text) * 60.0
    score -=  len(P.SYMBOL_NOISE.findall(text)) * 8.0
    score -=  len(P.LONG_TOK.findall(text)) * 6.0
    score -=  len(P.GARBAGE_TOK.findall(text)) * 15.0
    ascii_p = sum(1 for c in text if c in r"|/\\_=+*~`^@#$%&")
    score  -= (ascii_p / max(len(text), 1)) * 120.0
    return score


def _is_garbled(text: str) -> bool:
    if not text:
        return True
    if P.GARBAGE_TOK.search(text):
        return True
    if len(text) > 60:
        if _halanta_density(text) > 0.15:
            return True
        if _cluster_ratio(text) > 0.22:
            return True
    return False


def _est_tokens(text: str) -> int:
    """
    Better token estimate for Devanagari than len//4.
    Counts Devanagari syllable clusters (runs of dev chars) + ASCII words.
    This is ~2x more accurate than character-length division.
    """
    if not text:
        return 0
    dev_clusters = len(re.findall(r"[\u0900-\u097F]+", text))
    ascii_words  = len(re.findall(r"[a-zA-Z0-9]+", text))
    return max(dev_clusters + ascii_words, 1)


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation pipeline  (single ordered pass)
# ─────────────────────────────────────────────────────────────────────────────

def _remove_trailing_halanta(text: str) -> str:
    def _sub(m: re.Match) -> str:
        word = m.group(1)
        bare = word[:-1]
        if bare in HALANTA_KEEPERS or word in HALANTA_KEEPERS:
            return word
        return bare
    return P.HALANTA_END.sub(_sub, text)


def normalize_text(text: str) -> str:
    """
    Full normalisation + corruption-repair pipeline.
    Called on assembled chunk text (not raw per-line).

    Order:
      1  Invisible chars + symbol noise
      2  Converted-paren artifact  ९क० → (क)
      3  Regex corruption rules  (व्र्→व्य, ठद→दि, verb endings …)
      4  String replacement table  (word-level vocabulary fixes)
      5  नन → नि prefix artifact
      6  Compound-word structural repairs
      7  Half-char / matra-join
      8  Trailing halanta cleanup
      9  Danda normalisation
     10  Punctuation dedup
     11  Whitespace collapse
    """
    if not text:
        return text

    # 1
    text = P.SYMBOL_NOISE.sub(" ", text)
    text = text.replace(ZWJ, "").replace(ZWNJ, "")

    # 2
    text = P.CONV_PAREN.sub(r"(\1)", text)

    # 3
    text = _apply_regex_corrections(text)

    # 4
    text = _apply_str_replacements(text)

    # 5
    text = re.sub(r"\bनन(?=[\u0900-\u097F])", "नि", text)

    # 6
    for pat, rep in P.COMPOUNDS:
        text = pat.sub(rep, text)

    # 7
    text = P.HALF_JOIN.sub(r"\1\2", text)
    text = P.MATRA_JOIN.sub(r"\1\2", text)

    # 8
    text = _remove_trailing_halanta(text)

    # 9
    text = P.DANDA_SPC.sub("। ", text)
    text = P.MULTI_DANDA.sub("।", text)

    # 10
    text = P.REPEAT_PUNCT.sub(r"\1", text)

    # 11
    text = P.MULTI_WS.sub(" ", text)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# PDF extraction (improved: dict/block mode for reading order)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_page_text(page: fitz.Page) -> str:
    """
    Extract text in reading order using PyMuPDF dict/block mode.
    Handles multi-column Gazette layouts correctly.
    Falls back to plain 'text' mode if dict mode yields nothing.
    """
    try:
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
        lines_out: List[str] = []
        # Sort blocks top-to-bottom, left-to-right
        for blk in sorted(blocks, key=lambda b: (round(b["bbox"][1] / 10), b["bbox"][0])):
            if blk.get("type") != 0:   # 0 = text block
                continue
            for ln in blk.get("lines", []):
                line_text = "".join(s.get("text", "") for s in ln.get("spans", []))
                if line_text.strip():
                    lines_out.append(line_text)
        result = "\n".join(lines_out)
        if result.strip():
            return result
    except Exception:
        pass
    return page.get_text("text") or ""


def _best_page_text(page: fitz.Page) -> str:
    """
    Return best-quality normalised text for a page.
    Calls preeti_unicode.convert_text() only when raw quality score is below
    threshold — avoids degrading already-Unicode documents (Constitution, etc.)
    """
    raw      = _extract_page_text(page)
    raw_norm = normalize_text(raw)
    raw_q    = _text_quality(raw_norm)

    if raw_q < 40.0:
        try:
            conv      = preeti_unicode.convert_text(raw)
            conv_norm = normalize_text(conv)
            conv_q    = _text_quality(conv_norm)
            if conv_q > raw_q + 5:
                logger.debug(f"Preeti-converted (raw={raw_q:.1f} → conv={conv_q:.1f})")
                return conv_norm
        except Exception as exc:
            logger.warning(f"Preeti conversion failed: {exc}")

    return raw_norm


# ─────────────────────────────────────────────────────────────────────────────
# Document metadata
# ─────────────────────────────────────────────────────────────────────────────

def _detect_doc_type(text: str) -> str:
    if "संविधान" in text:
        return "संविधान"
    if any(k in text for k in ("नियमावली", "उपनियम")):
        return "नियमावली"
    if "ऐन" in text:
        return "ऐन"
    return "कानून"


def _extract_global_meta(text: str) -> Dict[str, str]:
    meta = {"short_title": "", "commencement": ""}
    compact = re.sub(r"\s+", " ", text)
    m = P.SHORT_TITLE.search(compact)
    if m:
        meta["short_title"] = m.group(1).strip(" :।-–")
    m = P.COMMENCE.search(compact)
    if m:
        meta["commencement"] = m.group(1).strip(" :।-–")
    return meta


def _law_name(pdf_path: str, short_title: str) -> str:
    if short_title:
        return short_title
    return (os.path.splitext(os.path.basename(pdf_path))[0]
            .replace("_", " ").replace("-", " ").strip())


# ─────────────────────────────────────────────────────────────────────────────
# Chunk quality gate
# ─────────────────────────────────────────────────────────────────────────────

def _is_meaningful(text: str) -> bool:
    if not text or len(text) < 50:
        return False
    if _nepali_ratio(text) < 0.38:
        return False
    if _is_garbled(text):
        return False
    words = text.split()
    if len(words) < 10 and not re.search(r"दफा|धारा|नियम|उपदफा|उपनियम|अनुसूची", text):
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Noise-line filter
# ─────────────────────────────────────────────────────────────────────────────

def _is_noise_line(line: str) -> bool:
    s = line.strip()
    if not s or len(s) < 3:
        return True
    if P.PAGE_NUM.match(s):
        return True
    if P.FOOTER_PG.match(s):
        return True
    if P.DATE_LINE.match(s):
        return True
    if P.NEPALI_YEAR.search(s):
        return True
    if P.GAZETTE_HDR.search(s):
        return True
    if P.GARBAGE_TOK.search(s):
        return True
    if "lawcommission" in s.lower() or "www." in s.lower():
        return True
    if P.GAZETTE_BDY.search(s) and not P.LEGAL_ANCHOR.search(s):
        return True
    if len(s) > 25 and _nepali_ratio(s) < 0.20:
        return True
    if _is_garbled(s):
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Sentence splitting with overlap
# ─────────────────────────────────────────────────────────────────────────────

def _split_sentences(text: str, max_tokens: int, overlap: int = 1) -> List[str]:
    """
    Split at दण्ड (।) boundaries into windows <= max_tokens.
    `overlap` trailing sentences from each window are prepended to the next
    to preserve cross-boundary context for retrieval.
    """
    hard = max(max_tokens * 4, 220)
    sents = [s.strip() for s in re.split(r"[।॥]\s*", text) if s.strip()]
    if not sents:
        return [text[i:i + hard].strip()
                for i in range(0, len(text), hard) if text[i:i + hard].strip()]

    windows: List[str] = []
    cur: List[str] = []

    def _tok(lst: List[str]) -> int:
        return _est_tokens(" ".join(lst))

    for sent in sents:
        test = cur + [sent]
        if _tok(test) > max_tokens and cur:
            windows.append("। ".join(cur) + "।")
            cur = cur[-overlap:] + [sent]
        else:
            cur.append(sent)
            # Hard split on single oversized sentence
            if _tok(cur) > max_tokens * 2 and len(cur) == 1:
                long = cur[0]
                for i in range(0, len(long), hard):
                    piece = long[i:i + hard].strip()
                    if piece:
                        windows.append(piece)
                cur = []

    if cur:
        windows.append("। ".join(cur) + "।")

    return [w for w in windows if w.strip()]


# ─────────────────────────────────────────────────────────────────────────────
# Main chunker class
# ─────────────────────────────────────────────────────────────────────────────

class NepaliLegalChunker:
    """
    Parse and chunk Nepali legal PDFs for RAG ingestion.

    Supports: Constitution, Civil Code, Citizenship Act, Passport Rules,
              Foreign Affairs documents, and other Nepal Gazette instruments.

    Usage
    -----
    chunker = NepaliLegalChunker()
    chunks  = chunker.process_pdf_for_rag("civil_code.pdf")
    # Returns List[Dict] with keys: id, text, metadata
    """

    def __init__(
        self,
        max_chunk_tokens:    int = 320,
        min_chunk_tokens:    int = 80,
        merge_target_tokens: int = 260,
        force_split_tokens:  int = 380,
        overlap_sentences:   int = 1,
    ):
        self.max_tokens   = max_chunk_tokens
        self.min_tokens   = min_chunk_tokens
        self.merge_target = merge_target_tokens
        self.force_split  = force_split_tokens
        self.overlap      = overlap_sentences

    # ── internal helpers ─────────────────────────────────────────────────────

    def _flush(
        self,
        chunks:   List[Dict],
        state:    _State,
        source:   str,
        doc_type: str,
        lname:    str,
        gmeta:    Dict[str, str],
    ) -> None:
        """Finalise current state buffer into one or more chunk dicts."""
        if not state.lines:
            return

        raw  = " ".join(ln.strip() for ln in state.lines if ln.strip()).strip()
        text = normalize_text(raw)

        if not text or not _is_meaningful(text):
            state.lines.clear()
            return

        res_anchor  = None if state.anchor in (_INTRO, _HEADER) else state.anchor
        res_chapter = (state.chapter if state.chapter and state.chapter != "Unknown"
                       else f"पृष्ठ {state.page_idx}")

        title_parts = [doc_type]
        if state.part:
            title_parts.append(state.part)
        title_parts.append(res_chapter)
        if res_anchor:
            title_parts.append(res_anchor)
        if state.upa_dafa:
            title_parts.append(state.upa_dafa)
        h_title = " > ".join(title_parts)

        base_meta: Dict = {
            "document_type":      doc_type,
            "law_name":           lname,
            "short_title":        gmeta.get("short_title", ""),
            "commencement":       gmeta.get("commencement", ""),
            "part":               state.part,
            "chapter":            res_chapter,
            "dafa":               res_anchor or "",
            "primary_anchor":     res_anchor or "",
            "upa_dafa":           state.upa_dafa or "",
            "hierarchical_title": h_title,
            "page":               state.page_idx,
            "source":             os.path.basename(source),
        }

        if _est_tokens(text) <= self.max_tokens:
            chunks.append({
                "id":   str(uuid.uuid4()),
                "text": text,
                "metadata": {
                    **base_meta,
                    "chunk_type":       "complete_section",
                    "estimated_tokens": _est_tokens(text),
                    "part_number":      0,
                },
            })
        else:
            for idx, piece in enumerate(
                _split_sentences(text, self.max_tokens, self.overlap), start=1
            ):
                if not piece.strip():
                    continue
                chunks.append({
                    "id":   str(uuid.uuid4()),
                    "text": piece,
                    "metadata": {
                        **base_meta,
                        "hierarchical_title": f"{h_title} (खण्ड {idx})",
                        "chunk_type":         "split_section",
                        "estimated_tokens":   _est_tokens(piece),
                        "part_number":        idx,
                    },
                })

        state.lines.clear()

    def _rebalance(self, chunks: List[Dict]) -> List[Dict]:
        """
        Pass 1: Drop chunks below quality threshold.
        Pass 2: Merge tiny adjacent chunks that share the exact same दफा scope.
                Cross-दफा merging is intentionally prevented.
        """
        valid  = [c for c in chunks if _is_meaningful(c.get("text", ""))]
        merged: List[Dict] = []

        for chunk in valid:
            if not merged:
                merged.append(chunk)
                continue

            prev  = merged[-1]
            pm, cm = prev["metadata"], chunk["metadata"]
            pt, ct = prev["text"], chunk["text"]
            p_tok  = pm.get("estimated_tokens", _est_tokens(pt))
            c_tok  = cm.get("estimated_tokens", _est_tokens(ct))

            same_dafa = (
                pm.get("source")  == cm.get("source")
                and pm.get("part")    == cm.get("part")
                and pm.get("chapter") == cm.get("chapter")
                and pm.get("dafa")    == cm.get("dafa")   # must be SAME दफा
            )

            if (
                same_dafa
                and (p_tok < self.min_tokens or c_tok < self.min_tokens)
                and (p_tok + c_tok) <= self.merge_target
            ):
                combined = f"{pt.strip()} {ct.strip()}".strip()
                new_meta = {**pm,
                            "estimated_tokens": _est_tokens(combined),
                            "chunk_type":       "merged_section"}
                merged[-1] = {
                    "id":       str(uuid.uuid4()),
                    "text":     combined,
                    "metadata": new_meta,
                }
            else:
                merged.append(chunk)

        return merged

    # ── public API ───────────────────────────────────────────────────────────

    def process_pdf_for_rag(self, pdf_path: str) -> List[Dict]:
        """
        Main entry point.

        Parameters
        ----------
        pdf_path : str
            Path to the Nepali legal PDF file.

        Returns
        -------
        List[Dict]
            Each dict: { "id": str, "text": str, "metadata": dict }
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        doc     = fitz.open(pdf_path)
        n_pages = len(doc)
        logger.info(f"Opening '{pdf_path}' — {n_pages} pages")

        first_text = _best_page_text(doc[0]) if n_pages > 0 else ""
        doc_type   = _detect_doc_type(first_text)
        gmeta      = _extract_global_meta(first_text)
        lname      = _law_name(pdf_path, gmeta.get("short_title", ""))
        logger.info(f"Document type: {doc_type} | Law name: {lname}")

        chunks: List[Dict] = []
        state  = _State()

        for pg_num, page in enumerate(doc):
            try:
                page_text = _best_page_text(page)
            except Exception as exc:
                logger.warning(f"Page {pg_num + 1} extraction failed: {exc}")
                continue

            for raw_line in page_text.splitlines():
                line = raw_line.strip()
                if not line or _is_noise_line(line):
                    continue

                # ── structural boundary detection ────────────────────────────

                # भाग (Part)
                m = P.PART.match(line)
                if m and len(line) <= 160:
                    self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                    p_num   = m.group(1)
                    p_title = (m.group(2) or "").strip()
                    state.part     = f"भाग {p_num}" + (f" — {p_title}" if p_title else "")
                    state.anchor   = _HEADER
                    state.upa_dafa = None
                    state.lines    = [line]
                    state.page_idx = pg_num + 1
                    continue

                # परिच्छेद (Chapter)
                m = P.CHAPTER.match(line)
                if m:
                    self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                    state.chapter  = f"परिच्छेद–{m.group(1)}"
                    state.anchor   = _HEADER
                    state.upa_dafa = None
                    state.lines    = [line]
                    state.page_idx = pg_num + 1
                    continue

                # अनुसूची (Schedule)
                m = P.SCHEDULE.match(line)
                if m:
                    self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                    sch_no    = (m.group(1) or "").strip()
                    sch_title = (m.group(2) or "").strip()
                    state.chapter  = (f"अनुसूची {sch_no}".strip()
                                      + (f" ({sch_title})" if sch_title else ""))
                    state.anchor   = _HEADER
                    state.upa_dafa = None
                    state.lines    = [line]
                    state.page_idx = pg_num + 1
                    continue

                # Primary anchors: धारा / दफा / नियम / bare Nepali numerals
                matched = False
                for label, pat, grp in P.ANCHORS:
                    am = pat.match(line)
                    if am:
                        if label == "§" and len(line) > 120:
                            break
                        self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                        num = am.group(grp)
                        if label == "§":
                            label = {"संविधान": "धारा", "नियमावली": "नियम"}.get(doc_type, "दफा")
                        state.anchor   = f"{label} {num}"
                        state.upa_dafa = None
                        state.lines    = [line]
                        state.page_idx = pg_num + 1
                        matched = True
                        break
                if matched:
                    continue

                # उपदफा / उपनियम
                m_upa = P.UPA_DAFA.match(line)
                m_unr = P.UPA_NIYAM.match(line)
                if m_upa or m_unr:
                    if state.upa_dafa is not None and state.lines:
                        self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                    if m_upa:
                        state.upa_dafa = f"({m_upa.group(1)})"
                    else:
                        no = m_unr.group(1) or m_unr.group(2) or ""
                        state.upa_dafa = f"उपनियम ({no})" if no else "उपनियम"
                    state.lines.append(line)
                    continue

                # Overflow guard — force-split before buffer gets too large
                projected = " ".join(state.lines + [line])
                if state.lines and _est_tokens(projected) > self.force_split:
                    self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
                    state.lines    = [line]
                    state.page_idx = pg_num + 1
                    continue

                state.lines.append(line)

        # Final flush for any remaining buffer content
        self._flush(chunks, state, pdf_path, doc_type, lname, gmeta)
        doc.close()

        logger.info(f"Raw chunks before rebalancing: {len(chunks)}")
        final = self._rebalance(chunks)
        logger.info(f"Final chunks after rebalancing: {len(final)}")
        return final


# # ─────────────────────────────────────────────────────────────────────────────
# # CLI smoke test  —  python nepali_legal_chunker.py <doc.pdf> [max_tokens]
# # ─────────────────────────────────────────────────────────────────────────────

# if __name__ == "__main__":
#     import sys

#     logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

#     if len(sys.argv) < 2:
#         print("Usage: python nepali_legal_chunker.py <document.pdf> [max_tokens]")
#         sys.exit(1)

#     pdf_file   = sys.argv[1]
#     max_tokens = int(sys.argv[2]) if len(sys.argv) > 2 else 320

#     chunker = NepaliLegalChunker(max_chunk_tokens=max_tokens)
#     results = chunker.process_pdf_for_rag(pdf_file)

#     print(f"\n{'─' * 65}")
#     print(f"  Total chunks: {len(results)}")
#     print(f"{'─' * 65}\n")

#     for i, c in enumerate(results[:8], 1):
#         m = c["metadata"]
#         print(f"[{i}] {m['hierarchical_title']}")
#         print(f"    page {m['page']} | ~{m['estimated_tokens']} tok | {m['chunk_type']}")
#         print(f"    {c['text'][:350]}")
#         print()