#!/usr/bin/env python3
"""
Local AI Chat Assistant for Essay Writing
Uses a lightweight approach for essay-specific assistance
"""

import sys
import json
import re
import random
from datetime import datetime

class EssayAI:
    def __init__(self):
        self.knowledge_base = {
            'structure': {
                'patterns': ['structure', 'organize', 'outline', 'format', 'layout'],
                'responses': [
                    "A strong essay structure follows the classic format: Introduction with hook and thesis, body paragraphs with topic sentences and evidence, and a conclusion that reinforces your main points.",
                    "Try the 5-paragraph structure: intro, 3 body paragraphs (each with a main point), and conclusion. Each body paragraph should have: topic sentence, evidence, explanation, and transition.",
                    "Start with an outline: I. Introduction (hook, background, thesis), II. Main points (A, B, C), III. Conclusion (restate thesis, summarize, call to action)."
                ]
            },
            'introduction': {
                'patterns': ['introduction', 'intro', 'opening', 'hook', 'start'],
                'responses': [
                    "Start with a compelling hook: a surprising statistic, thought-provoking question, or relevant quote. Then provide background context and end with your clear thesis statement.",
                    "Your introduction should grab attention immediately. Try: 'Imagine if...' or 'What if I told you...' followed by context that leads to your thesis.",
                    "A strong intro has three parts: Hook (grab attention), Bridge (connect to your topic), Thesis (your main argument). Keep it concise but engaging."
                ]
            },
            'thesis': {
                'patterns': ['thesis', 'main argument', 'central claim', 'position'],
                'responses': [
                    "Your thesis should be specific, arguable, and preview your main points. Example: 'Social media harms teen mental health through cyberbullying, sleep disruption, and unrealistic comparisons.'",
                    "A strong thesis takes a clear position and gives a roadmap. Avoid vague statements like 'Social media is bad.' Instead: 'Social media platforms should implement stricter age verification because...'",
                    "Make your thesis the last sentence of your introduction. It should answer 'So what?' and tell readers exactly what you'll prove."
                ]
            },
            'evidence': {
                'patterns': ['evidence', 'support', 'proof', 'examples', 'sources'],
                'responses': [
                    "Use the PEEL method: Point (topic sentence), Evidence (facts, quotes, statistics), Explanation (how it supports your point), Link (connect to thesis).",
                    "Strong evidence includes: peer-reviewed studies, expert quotes, statistical data, historical examples, and case studies. Always cite your sources properly.",
                    "Don't just drop quotes - introduce them: 'According to Dr. Smith's 2023 study...' Then explain why this evidence matters to your argument."
                ]
            },
            'conclusion': {
                'patterns': ['conclusion', 'ending', 'wrap up', 'finish'],
                'responses': [
                    "Your conclusion should: restate your thesis in new words, summarize key points, and end with a call to action or thought-provoking statement.",
                    "Don't just repeat your introduction. Show how your evidence proves your thesis, then zoom out to bigger implications: 'Why does this matter?'",
                    "End with impact: 'If we don't address this issue...' or 'The future depends on...' Leave readers thinking about your message."
                ]
            },
            'grammar': {
                'patterns': ['grammar', 'mistakes', 'errors', 'correct'],
                'responses': [
                    "Common grammar issues: subject-verb disagreement ('The group of students are' → 'is'), comma splices, and sentence fragments. Read aloud to catch errors.",
                    "Use active voice when possible: 'The researcher conducted the study' instead of 'The study was conducted by the researcher.'",
                    "Watch for: its/it's (possessive vs. contraction), their/there/they're, and affect/effect. When in doubt, look it up!"
                ]
            },
            'improvement': {
                'patterns': ['improve', 'better', 'enhance', 'strengthen'],
                'responses': [
                    "To improve your essay: vary sentence length, use stronger verbs, eliminate filler words ('very', 'really'), and ensure each paragraph has one clear main idea.",
                    "Read your essay aloud - if you stumble, your readers will too. Look for places to combine short sentences or break up long ones.",
                    "Check transitions between paragraphs. Each should flow naturally: 'Furthermore...', 'However...', 'In contrast...', 'As a result...'"
                ]
            }
        }
        
        self.conversation_starters = [
            "I'm here to help you write a better essay! What would you like to work on?",
            "Great to see you writing! What aspect of your essay needs attention?",
            "Let's make your essay shine! What specific help do you need?",
            "I'm your essay writing assistant. How can I help improve your work today?"
        ]

    def generate_response(self, message, context=""):
        message_lower = message.lower()
        
        # Check for specific topics
        for topic, data in self.knowledge_base.items():
            for pattern in data['patterns']:
                if pattern in message_lower:
                    response = random.choice(data['responses'])
                    return self.personalize_response(response, context, message)
        
        # Context-aware responses
        if context:
            return self.analyze_context(message, context)
        
        # General encouragement and guidance
        if any(word in message_lower for word in ['help', 'stuck', 'don\'t know']):
            return "I understand writing can be challenging! Let's break it down. Are you working on your introduction, body paragraphs, or conclusion? Or do you need help with structure, evidence, or grammar?"
        
        if any(word in message_lower for word in ['good', 'bad', 'rate', 'score']):
            return "I can't rate your essay, but I can help you improve it! Share what you're working on and I'll give specific suggestions for making it stronger."
        
        # Default helpful response
        return random.choice(self.conversation_starters)

    def analyze_context(self, message, context):
        word_count = len(context.split())
        
        if 'word count' in message.lower() or 'length' in message.lower():
            if word_count < 100:
                return f"Your essay is {word_count} words. That's a good start! Consider expanding with more examples, evidence, or deeper analysis of your points."
            elif word_count < 300:
                return f"You have {word_count} words - you're building momentum! Focus on developing each main point with specific evidence and explanation."
            else:
                return f"Great progress with {word_count} words! Now focus on refining your arguments and ensuring smooth transitions between ideas."
        
        if 'improve' in message.lower() or 'better' in message.lower():
            suggestions = []
            
            # Check for common issues
            if context.count('.') < 3:
                suggestions.append("Add more detailed examples and explanations")
            
            sentences = context.split('.')
            if len(sentences) > 2:
                avg_length = sum(len(s.split()) for s in sentences) / len(sentences)
                if avg_length < 8:
                    suggestions.append("Combine some short sentences for better flow")
                elif avg_length > 25:
                    suggestions.append("Break up some long sentences for clarity")
            
            if not any(word in context.lower() for word in ['however', 'therefore', 'furthermore', 'moreover']):
                suggestions.append("Add transition words to connect your ideas")
            
            if suggestions:
                return "Based on your text, here are some suggestions: " + "; ".join(suggestions) + "."
            else:
                return "Your essay looks solid! Focus on strengthening your evidence and making sure each paragraph clearly supports your thesis."
        
        return "I can see you're working hard on your essay! What specific aspect would you like help with - structure, evidence, grammar, or something else?"

    def personalize_response(self, response, context, original_message):
        # Add context-specific details when possible
        if context and len(context) > 50:
            word_count = len(context.split())
            if word_count > 200:
                response += f" Your essay is developing well at {word_count} words!"
            else:
                response += f" Keep building on your {word_count} words!"
        
        return response

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No message provided"}))
        return
    
    message = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else ""
    
    ai = EssayAI()
    response = ai.generate_response(message, context)
    
    result = {
        "response": response,
        "timestamp": datetime.now().isoformat(),
        "type": "ai_assistant"
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()