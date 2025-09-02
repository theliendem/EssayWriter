const { spawn } = require('child_process');
const path = require('path');

function testAIDetection(text) {
    return new Promise((resolve, reject) => {
        console.log('Testing AI detection with text:', text.substring(0, 50) + '...');
        
        const python = spawn('python3', [path.join(__dirname, 'ai_detector.py'), '--text', text]);
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        python.on('close', (code) => {
            console.log(`Python script exited with code: ${code}`);
            if (errorOutput) console.log('Stderr:', errorOutput);
            
            if (code === 0 && output.trim()) {
                try {
                    const result = JSON.parse(output.trim());
                    console.log('✅ Enhanced AI detection working!');
                    console.log('Result:', result);
                    resolve(result);
                } catch (parseError) {
                    console.log('❌ Parse error:', parseError.message);
                    console.log('Raw output:', output);
                    reject(parseError);
                }
            } else {
                console.log('❌ Python script failed');
                reject(new Error(`Script failed with code ${code}`));
            }
        });
        
        python.on('error', (error) => {
            console.log('❌ Spawn error:', error.message);
            reject(error);
        });
    });
}

// Test with sample text
const testText = `This is a comprehensive essay about artificial intelligence and its impact on modern society. 
The development of AI technologies has revolutionized numerous industries and continues to shape our daily lives. 
From machine learning algorithms to natural language processing, these innovations have created unprecedented opportunities for automation and efficiency. 
However, we must also consider the ethical implications and potential challenges that arise from widespread AI adoption.
The future of artificial intelligence depends on our ability to balance technological advancement with responsible implementation.`;

testAIDetection(testText)
    .then(result => {
        console.log('\n🎉 Test successful! Enhanced AI detection is working properly.');
        process.exit(0);
    })
    .catch(error => {
        console.log('\n❌ Test failed:', error.message);
        console.log('The system will use fallback detection instead.');
        process.exit(1);
    });