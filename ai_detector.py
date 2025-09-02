#!/usr/bin/env python3
"""
Enhanced AI Detection using GPTZero-style perplexity analysis
Based on: https://github.com/BurhanUlTayyab/GPTZero
"""

import sys
import json
import re
import math
from collections import Counter
import argparse

def calculate_perplexity_score(text):
    """
    Calculate a perplexity-like score for AI detection
    Higher scores indicate more likely AI-generated content
    """
    if not text or len(text.strip()) < 10:
        return {"error": "Text too short for analysis"}
    
    # Clean and tokenize text
    text = re.sub(r'[^\w\s\.\!\?]', '', text.lower())
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    words = text.split()
    
    if len(sentences) < 1 or len(words) < 5:
        return {"error": "Text too short for reliable analysis"}
    
    # Calculate various metrics
    metrics = {}
    
    # 1. Sentence length consistency (burstiness)
    sentence_lengths = [len(s.split()) for s in sentences]
    avg_length = sum(sentence_lengths) / len(sentence_lengths)
    variance = sum((l - avg_length) ** 2 for l in sentence_lengths) / len(sentence_lengths)
    burstiness = math.sqrt(variance) / avg_length if avg_length > 0 else 0
    metrics['burstiness'] = burstiness
    
    # 2. Perplexity approximation using word frequency
    word_counts = Counter(words)
    total_words = len(words)
    
    # Calculate entropy-based perplexity
    entropy = 0
    for word, count in word_counts.items():
        prob = count / total_words
        entropy -= prob * math.log2(prob)
    
    perplexity = 2 ** entropy
    metrics['perplexity'] = perplexity
    
    # 3. Vocabulary diversity
    unique_words = len(set(words))
    diversity = unique_words / total_words
    metrics['diversity'] = diversity
    
    # 4. Repetition patterns
    bigrams = [(words[i], words[i+1]) for i in range(len(words)-1)]
    bigram_counts = Counter(bigrams)
    repetition_score = sum(1 for count in bigram_counts.values() if count > 1) / len(bigrams)
    metrics['repetition'] = repetition_score
    
    # 5. Sentence structure similarity
    sentence_starts = [s.split()[0] if s.split() else '' for s in sentences]
    start_diversity = len(set(sentence_starts)) / len(sentences) if sentences else 0
    metrics['start_diversity'] = start_diversity
    
    # Calculate final AI probability
    # Lower burstiness = more AI-like
    # Higher repetition = more AI-like
    # Lower start diversity = more AI-like
    # Moderate perplexity = more AI-like
    
    ai_score = 0
    
    # Burstiness component (0-40 points)
    if burstiness < 0.3:
        ai_score += 40
    elif burstiness < 0.6:
        ai_score += 25
    elif burstiness < 1.0:
        ai_score += 10
    
    # Repetition component (0-25 points)
    ai_score += min(25, repetition_score * 100)
    
    # Start diversity component (0-20 points)
    if start_diversity < 0.5:
        ai_score += 20
    elif start_diversity < 0.7:
        ai_score += 10
    
    # Perplexity component (0-15 points)
    if 20 < perplexity < 80:  # Sweet spot for AI
        ai_score += 15
    elif 10 < perplexity < 150:
        ai_score += 8
    
    # Normalize to percentage
    ai_probability = min(95, max(5, ai_score))
    
    return {
        "ai_probability": round(ai_probability, 1),
        "human_probability": round(100 - ai_probability, 1),
        "metrics": {
            "burstiness": round(burstiness, 3),
            "perplexity": round(perplexity, 2),
            "diversity": round(diversity, 3),
            "repetition": round(repetition_score, 3),
            "start_diversity": round(start_diversity, 3)
        },
        "analysis": generate_analysis(ai_probability, metrics)
    }

def generate_analysis(ai_prob, metrics):
    """Generate human-readable analysis"""
    analysis = []
    
    if ai_prob > 80:
        analysis.append("Very likely AI-generated")
        analysis.append("Text shows high uniformity and predictable patterns")
    elif ai_prob > 60:
        analysis.append("Likely AI-generated")
        analysis.append("Some indicators of artificial generation present")
    elif ai_prob > 40:
        analysis.append("Mixed signals - could be AI or human")
        analysis.append("Text shows both human and AI characteristics")
    elif ai_prob > 20:
        analysis.append("Likely human-written")
        analysis.append("Shows good variation and natural patterns")
    else:
        analysis.append("Very likely human-written")
        analysis.append("Strong indicators of human creativity and variation")
    
    # Add specific observations
    if metrics['burstiness'] < 0.3:
        analysis.append("⚠️ Sentences are very uniform in length")
    elif metrics['burstiness'] > 1.0:
        analysis.append("✓ Good sentence length variation")
    
    if metrics['repetition'] > 0.1:
        analysis.append("⚠️ High repetition in word patterns")
    
    if metrics['start_diversity'] < 0.5:
        analysis.append("⚠️ Limited variety in sentence beginnings")
    
    return analysis

def main():
    parser = argparse.ArgumentParser(description='AI Text Detection')
    parser.add_argument('--text', type=str, help='Text to analyze')
    parser.add_argument('--file', type=str, help='File containing text to analyze')
    
    args = parser.parse_args()
    
    if args.text:
        text = args.text
    elif args.file:
        try:
            with open(args.file, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception as e:
            print(json.dumps({"error": f"Could not read file: {str(e)}"}))
            return
    else:
        # Read from stdin
        text = sys.stdin.read()
    
    result = calculate_perplexity_score(text)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()