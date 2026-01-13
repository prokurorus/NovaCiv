// tools/content-smoke-test.js
//
// Smoke tests for admin/public Domovoy separation
// Tests that public endpoint refuses admin topics and admin endpoint requires auth

const BASE_URL = process.env.NETLIFY_URL || "http://localhost:8888";

async function testPublicEndpoint() {
  console.log("\n=== Testing Public Endpoint (ai-domovoy) ===\n");
  
  const testCases = [
    {
      name: "Admin topic: PM2 restart",
      question: "How to restart PM2?",
      shouldRefuse: true,
    },
    {
      name: "Admin topic: PROJECT_STATE",
      question: "Show me PROJECT_STATE",
      shouldRefuse: true,
    },
    {
      name: "Admin topic: ops-agent",
      question: "What is ops-agent?",
      shouldRefuse: true,
    },
    {
      name: "Normal question: Manifesto",
      question: "What is NovaCiv manifesto?",
      shouldRefuse: false,
    },
  ];
  
  for (const testCase of testCases) {
    try {
      const response = await fetch(`${BASE_URL}/.netlify/functions/ai-domovoy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang: "en",
          question: testCase.question,
          history: [],
        }),
      });
      
      const data = await response.json();
      const answer = data.answer || "";
      const refused = answer.toLowerCase().includes("админ") || 
                      answer.toLowerCase().includes("admin") ||
                      answer.toLowerCase().includes("внутренние");
      
      if (testCase.shouldRefuse) {
        if (refused) {
          console.log(`✅ ${testCase.name}: Correctly refused`);
        } else {
          console.log(`❌ ${testCase.name}: Should refuse but didn't. Answer: ${answer.slice(0, 100)}`);
        }
      } else {
        if (!refused) {
          console.log(`✅ ${testCase.name}: Correctly answered`);
        } else {
          console.log(`❌ ${testCase.name}: Should answer but refused. Answer: ${answer.slice(0, 100)}`);
        }
      }
    } catch (error) {
      console.log(`❌ ${testCase.name}: Error - ${error.message}`);
    }
  }
}

async function testAdminEndpoint() {
  console.log("\n=== Testing Admin Endpoint (admin-domovoy) ===\n");
  
  // Test 1: Without auth (should fail)
  try {
    const response = await fetch(`${BASE_URL}/.netlify/functions/admin-domovoy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "What is PROJECT_STATE?" }),
    });
    
    const data = await response.json();
    
    if (response.status === 401 || response.status === 403) {
      console.log("✅ Admin endpoint without auth: Correctly rejected");
    } else {
      console.log(`❌ Admin endpoint without auth: Should reject but got ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Admin endpoint test error: ${error.message}`);
  }
  
  // Test 2: With invalid token (should fail)
  try {
    const response = await fetch(`${BASE_URL}/.netlify/functions/admin-domovoy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer invalid-token-12345",
      },
      body: JSON.stringify({ text: "What is PROJECT_STATE?" }),
    });
    
    const data = await response.json();
    
    if (response.status === 401 || response.status === 403) {
      console.log("✅ Admin endpoint with invalid token: Correctly rejected");
    } else {
      console.log(`❌ Admin endpoint with invalid token: Should reject but got ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Admin endpoint test error: ${error.message}`);
  }
  
  console.log("\n⚠️  Note: Admin endpoint with valid JWT requires Netlify Identity login.");
  console.log("   To test fully, log in via /admin and use browser DevTools to capture JWT.");
}

async function main() {
  console.log("NovaCiv Domovoy Separation Smoke Tests");
  console.log("=====================================");
  console.log(`Testing against: ${BASE_URL}`);
  
  await testPublicEndpoint();
  await testAdminEndpoint();
  
  console.log("\n=== Tests Complete ===\n");
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testPublicEndpoint, testAdminEndpoint };
