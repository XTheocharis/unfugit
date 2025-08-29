# Unfugit Restore Apply Comprehensive Test Results

Test started: 2025-08-29T02:34:36.107Z
Project root: /home/user/.claude/mcp-servers/unfugit

Starting MCP server...
MCP server started and initialized

============================================================
TEST 1: Setup and Initial State
============================================================
Getting initial history...
History response: {
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 50 commits\n\n7d170c10 - Audit: 19 files changed at 2025-08-29T00:16:26.790Z\nb68d6b49 - Audit: 19 files changed at 2025-08-29T00:16:24.717Z\nbd92922f - Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n30d0504c - Audit: 19 files changed at 2025-08-29T00:16:20.688Z\nee3ec6b3 - Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n... and 45 more commits"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "resource://unfugit/history/list.json",
          "mimeType": "application/json",
          "text": "{\"commits\":[{\"hash\":\"7d170c10afbea200f215076aa5ace41ed3b43d85\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:26.790Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b68d6b49a652a19af0bdc8779c8f5d918ec8ef40\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:24.717Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"bd92922f3b633970df5037e81519e289385ee0d1\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:22.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:22.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"30d0504c7a46ed483fd0a11df8427dca79e25c8b\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:20.688Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:20.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"ee3ec6b33794d5cd181525e0f8c316d2bb3ef992\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:53.035Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:53.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b49a5261d0f95eb23d36aadda862163432d9709c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:50.944Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:51.000Z\",\"filesChanged\":2,\"insertions\":0,\"deletions\":20,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"f8d0b49f048162b95b8a1bd9cd0729c98c7d008c\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:44.720Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:44.000Z\",\"filesChanged\":2,\"insertions\":20,\"deletions\":0,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"53e76e620c5b05a42bac86fe4b17e483dcf16163\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:39.287Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:39.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"6e93307f21aac087c389815cdb816aac3c751a50\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:29.261Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:29.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"bbd35413ed16c23027415587af74d395a1a3437a\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:23.077Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:23.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"880229dddec587c4a72ef371734cc77f128e5d6d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:19.275Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:19.000Z\",\"filesChanged\":10,\"insertions\":0,\"deletions\":100,\"files\":[\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"f621080b66e579e7a7b414cb2b6a1f855fe1661a\",\"message\":\"Audit: 13 files changed at 2025-08-29T00:15:18.121Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:18.000Z\",\"filesChanged\":11,\"insertions\":100,\"deletions\":10,\"files\":[\"temp2_get.md\",\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:17.117Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:17.000Z\",\"filesChanged\":2,\"insertions\":10,\"deletions\":10,\"files\":[\"test-get-mcp.cjs\",\"temp2_get.md\"]},{\"hash\":\"dd2a0fb7119b840fcd52584bedd461d05149f8db\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:12.315Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:12.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.cjs\"]},{\"hash\":\"699f693b16276c39eed756774c94ae72c213a19d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:09.288Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:09.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b5251567bcd3b1a7b30fdf4f752448417aaa144e\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:02.192Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:02.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"4465a1e3e4302841bbd6ef4fe5e38f774bc020d3\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:59.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:59.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"026ddff26c891bd319c41a5ddb8dad05d1ff78ea\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:56.603Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:56.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b97fd07f576068f7bc02f9c7f3145e7e9d265fdf\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:49.274Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:49.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"481efbb68db851d6295094cef2b39e1276e0d78f\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:39.256Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:39.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"6247ac57ce1d5df921441557b4665d70d51e1dfa\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:36.735Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e17e226d4d3bcf0fec035ba516ab6ab665a68de1\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:29.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":4,\"insertions\":40,\"deletions\":0,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"b8795f957ef78d85e01cefa80c551a7ea7b8be23\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:29.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5afec307e6143a99e275e3d357ad951c7c45dfc1\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:27.546Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:19.236Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:19.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"674822502f11957e596188e3988b2bb9bcdde0ac\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:16.003Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:16.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"2b452c2e80fca515bee87e4c308029ad40382d22\",\"message\":\"Audit: 52 files changed at 2025-08-29T00:14:15.328Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:15.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"58df031fd52bbe6e6a91304e41cf84e035c4a065\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:11.907Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:11.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"0c803cec316f75c4851c9c59420116f73c31e09c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:09.237Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:09.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cc12209e0fe0e4692cc6880e78caecb76925ea43\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:00.065Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:00.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"f606bc38d23e03c231ac489e3922723589c98443\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:13:01.105Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:13:01.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:54.226Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:54.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"34ae005ae3ce3817f5c8818e187b4f39ee0100fe\",\"message\":\"Audit: 9 files changed at 2025-08-29T00:12:52.267Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:52.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"04d4064f23d78eef1de19c9ad568496a7f5b0f8d\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:51.366Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"7aebf49f0e3975680137f17a58aae7d5aee0d2cb\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:12:50.333Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cdc0ca42b091d9b3d04c953838e76ab033a1702e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:51.146Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"a18b7d43e0b27e220111f15ef1484f8d4632d056\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:36.050Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5148d81ef8ce9875538d322b2656a4fdb635f9b4\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:21.103Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:21.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"de1739d6c08a7ae287a24729d974d2c99454a9d8\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:06.047Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:06.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:50.998Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"aa4a9fb0d49153902b1566e76da6bac1583ee024\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:35.949Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"d4bb99f354d6755ffcf6224fa5d335f0a616d64c\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:44.841Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:45.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"4f62ce2f873e8bc6a679445159731f3a4a8e98bb\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:34.787Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:35.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"24e28eacfc7659984278f9cbb6a4ed003011e214\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:24.732Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"eb84a8c58f87b03bd462af9e33fc5b86439e4032\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:14.703Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:14.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"3fe1622fc7160266821c4e4cad1a2a7b701cc258\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:04.616Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:04.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e91d0988f1ece477046f2633b7af331f32aca72e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:18.357Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:18.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"f17842180ff7a2b6a462b596130c57444ec01a23\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:08.408Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:08.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"9908a119a70c0c91dd8288b4b02d6fcea2cc9016\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:10:50.098Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:10:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:09:49.449Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:09:49.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"test-binary.bin\",\"test-json.json\",\"test-large.txt\",\"test-text.txt\"]}],\"nextCursor\":null}",
          "_meta": {
            "size": 14022
          }
        }
      }
    ],
    "isError": false,
    "structuredContent": {
      "commits": [
        {
          "hash": "7d170c10afbea200f215076aa5ace41ed3b43d85",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:26.790Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b68d6b49a652a19af0bdc8779c8f5d918ec8ef40",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:24.717Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "bd92922f3b633970df5037e81519e289385ee0d1",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:22.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "30d0504c7a46ed483fd0a11df8427dca79e25c8b",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:20.688Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:20.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "ee3ec6b33794d5cd181525e0f8c316d2bb3ef992",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:53.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b49a5261d0f95eb23d36aadda862163432d9709c",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:50.944Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:51.000Z",
          "filesChanged": 2,
          "insertions": 0,
          "deletions": 20,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "f8d0b49f048162b95b8a1bd9cd0729c98c7d008c",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:44.720Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:44.000Z",
          "filesChanged": 2,
          "insertions": 20,
          "deletions": 0,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "53e76e620c5b05a42bac86fe4b17e483dcf16163",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:39.287Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:39.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "6e93307f21aac087c389815cdb816aac3c751a50",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:29.261Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:29.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "bbd35413ed16c23027415587af74d395a1a3437a",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:23.077Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:23.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "880229dddec587c4a72ef371734cc77f128e5d6d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:19.275Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:19.000Z",
          "filesChanged": 10,
          "insertions": 0,
          "deletions": 100,
          "files": [
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "f621080b66e579e7a7b414cb2b6a1f855fe1661a",
          "message": "Audit: 13 files changed at 2025-08-29T00:15:18.121Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:18.000Z",
          "filesChanged": 11,
          "insertions": 100,
          "deletions": 10,
          "files": [
            "temp2_get.md",
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:17.117Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:17.000Z",
          "filesChanged": 2,
          "insertions": 10,
          "deletions": 10,
          "files": [
            "test-get-mcp.cjs",
            "temp2_get.md"
          ]
        },
        {
          "hash": "dd2a0fb7119b840fcd52584bedd461d05149f8db",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:12.315Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:12.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.cjs"
          ]
        },
        {
          "hash": "699f693b16276c39eed756774c94ae72c213a19d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:09.288Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:09.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b5251567bcd3b1a7b30fdf4f752448417aaa144e",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:02.192Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:02.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "4465a1e3e4302841bbd6ef4fe5e38f774bc020d3",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:59.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:59.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "026ddff26c891bd319c41a5ddb8dad05d1ff78ea",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:56.603Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:56.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b97fd07f576068f7bc02f9c7f3145e7e9d265fdf",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:49.274Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:49.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "481efbb68db851d6295094cef2b39e1276e0d78f",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:39.256Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:39.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "6247ac57ce1d5df921441557b4665d70d51e1dfa",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:36.735Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e17e226d4d3bcf0fec035ba516ab6ab665a68de1",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:29.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 4,
          "insertions": 40,
          "deletions": 0,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "b8795f957ef78d85e01cefa80c551a7ea7b8be23",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:29.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5afec307e6143a99e275e3d357ad951c7c45dfc1",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:27.546Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:19.236Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:19.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "674822502f11957e596188e3988b2bb9bcdde0ac",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:16.003Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:16.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "2b452c2e80fca515bee87e4c308029ad40382d22",
          "message": "Audit: 52 files changed at 2025-08-29T00:14:15.328Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:15.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "58df031fd52bbe6e6a91304e41cf84e035c4a065",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:11.907Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:11.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "0c803cec316f75c4851c9c59420116f73c31e09c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:09.237Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:09.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cc12209e0fe0e4692cc6880e78caecb76925ea43",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:00.065Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:00.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "f606bc38d23e03c231ac489e3922723589c98443",
          "message": "Audit: 1 files changed at 2025-08-29T00:13:01.105Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:13:01.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:54.226Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:54.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "34ae005ae3ce3817f5c8818e187b4f39ee0100fe",
          "message": "Audit: 9 files changed at 2025-08-29T00:12:52.267Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:52.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "04d4064f23d78eef1de19c9ad568496a7f5b0f8d",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:51.366Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "7aebf49f0e3975680137f17a58aae7d5aee0d2cb",
          "message": "Audit: 19 files changed at 2025-08-29T00:12:50.333Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cdc0ca42b091d9b3d04c953838e76ab033a1702e",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:51.146Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "a18b7d43e0b27e220111f15ef1484f8d4632d056",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:36.050Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5148d81ef8ce9875538d322b2656a4fdb635f9b4",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:21.103Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:21.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "de1739d6c08a7ae287a24729d974d2c99454a9d8",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:06.047Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:06.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:50.998Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "aa4a9fb0d49153902b1566e76da6bac1583ee024",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:35.949Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "d4bb99f354d6755ffcf6224fa5d335f0a616d64c",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:44.841Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:45.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "4f62ce2f873e8bc6a679445159731f3a4a8e98bb",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:34.787Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:35.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "24e28eacfc7659984278f9cbb6a4ed003011e214",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:24.732Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "eb84a8c58f87b03bd462af9e33fc5b86439e4032",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:14.703Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:14.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "3fe1622fc7160266821c4e4cad1a2a7b701cc258",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:04.616Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:04.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e91d0988f1ece477046f2633b7af331f32aca72e",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:18.357Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:18.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "f17842180ff7a2b6a462b596130c57444ec01a23",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:08.408Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:08.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "9908a119a70c0c91dd8288b4b02d6fcea2cc9016",
          "message": "Audit: 19 files changed at 2025-08-28T23:10:50.098Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:10:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88",
          "message": "Audit: 19 files changed at 2025-08-28T23:09:49.449Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:09:49.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "test-binary.bin",
            "test-json.json",
            "test-large.txt",
            "test-text.txt"
          ]
        }
      ],
      "nextCursor": null
    }
  },
  "jsonrpc": "2.0",
  "id": 2
}
Stats response: {
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Server v1.0.0, role: passive, repo: 160 commits, 0KB"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "resource://unfugit/stats.json",
          "mimeType": "application/json",
          "text": "{\"version\":\"1.0.0\",\"role\":\"passive\",\"read_only\":true,\"session_id\":\"5c819f27-6767-4605-b552-24cdfe308c72\",\"repo\":{\"path\":\"/home/user/.local/share/unfugit/repos/7eda38e2fc58d0db_home-user-claude-mcp-servers-unfugit\",\"total_commits\":160,\"session_commits\":0,\"size_bytes\":0,\"objects\":0,\"packs\":0,\"last_fsck\":null,\"last_maintenance\":null},\"limits\":{\"maxBytesPerResult\":1048576,\"serverTimeoutMs\":30000,\"cursorTtlSeconds\":600,\"resourceTtlSeconds\":900}}",
          "_meta": {
            "size": 444
          }
        }
      }
    ],
    "isError": false,
    "structuredContent": {
      "version": "1.0.0",
      "role": "passive",
      "read_only": true,
      "session_id": "5c819f27-6767-4605-b552-24cdfe308c72",
      "repo": {
        "path": "/home/user/.local/share/unfugit/repos/7eda38e2fc58d0db_home-user-claude-mcp-servers-unfugit",
        "total_commits": 160,
        "session_commits": 0,
        "size_bytes": 0,
        "objects": 0,
        "packs": 0,
        "last_fsck": null,
        "last_maintenance": null
      },
      "limits": {
        "maxBytesPerResult": 1048576,
        "serverTimeoutMs": 30000,
        "cursorTtlSeconds": 600,
        "resourceTtlSeconds": 900
      }
    }
  },
  "jsonrpc": "2.0",
  "id": 3
}

============================================================
TEST 2: Create Test Files and Track Changes
============================================================
Creating initial test files...
Modifying test files...
Deleting one test file...

============================================================
TEST 3: Get History and Prepare for Restore Tests
============================================================
Updated history: {
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 50 commits\n\n7d170c10 - Audit: 19 files changed at 2025-08-29T00:16:26.790Z\nb68d6b49 - Audit: 19 files changed at 2025-08-29T00:16:24.717Z\nbd92922f - Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n30d0504c - Audit: 19 files changed at 2025-08-29T00:16:20.688Z\nee3ec6b3 - Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n... and 45 more commits"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "resource://unfugit/history/list.json",
          "mimeType": "application/json",
          "text": "{\"commits\":[{\"hash\":\"7d170c10afbea200f215076aa5ace41ed3b43d85\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:26.790Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b68d6b49a652a19af0bdc8779c8f5d918ec8ef40\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:24.717Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"bd92922f3b633970df5037e81519e289385ee0d1\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:22.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:22.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"30d0504c7a46ed483fd0a11df8427dca79e25c8b\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:20.688Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:20.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"ee3ec6b33794d5cd181525e0f8c316d2bb3ef992\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:53.035Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:53.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b49a5261d0f95eb23d36aadda862163432d9709c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:50.944Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:51.000Z\",\"filesChanged\":2,\"insertions\":0,\"deletions\":20,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"f8d0b49f048162b95b8a1bd9cd0729c98c7d008c\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:44.720Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:44.000Z\",\"filesChanged\":2,\"insertions\":20,\"deletions\":0,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"53e76e620c5b05a42bac86fe4b17e483dcf16163\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:39.287Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:39.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"6e93307f21aac087c389815cdb816aac3c751a50\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:29.261Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:29.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"bbd35413ed16c23027415587af74d395a1a3437a\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:23.077Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:23.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"880229dddec587c4a72ef371734cc77f128e5d6d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:19.275Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:19.000Z\",\"filesChanged\":10,\"insertions\":0,\"deletions\":100,\"files\":[\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"f621080b66e579e7a7b414cb2b6a1f855fe1661a\",\"message\":\"Audit: 13 files changed at 2025-08-29T00:15:18.121Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:18.000Z\",\"filesChanged\":11,\"insertions\":100,\"deletions\":10,\"files\":[\"temp2_get.md\",\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:17.117Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:17.000Z\",\"filesChanged\":2,\"insertions\":10,\"deletions\":10,\"files\":[\"test-get-mcp.cjs\",\"temp2_get.md\"]},{\"hash\":\"dd2a0fb7119b840fcd52584bedd461d05149f8db\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:12.315Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:12.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.cjs\"]},{\"hash\":\"699f693b16276c39eed756774c94ae72c213a19d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:09.288Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:09.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b5251567bcd3b1a7b30fdf4f752448417aaa144e\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:02.192Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:02.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"4465a1e3e4302841bbd6ef4fe5e38f774bc020d3\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:59.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:59.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"026ddff26c891bd319c41a5ddb8dad05d1ff78ea\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:56.603Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:56.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b97fd07f576068f7bc02f9c7f3145e7e9d265fdf\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:49.274Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:49.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"481efbb68db851d6295094cef2b39e1276e0d78f\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:39.256Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:39.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"6247ac57ce1d5df921441557b4665d70d51e1dfa\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:36.735Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e17e226d4d3bcf0fec035ba516ab6ab665a68de1\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:29.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":4,\"insertions\":40,\"deletions\":0,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"b8795f957ef78d85e01cefa80c551a7ea7b8be23\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:29.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5afec307e6143a99e275e3d357ad951c7c45dfc1\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:27.546Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:19.236Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:19.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"674822502f11957e596188e3988b2bb9bcdde0ac\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:16.003Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:16.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"2b452c2e80fca515bee87e4c308029ad40382d22\",\"message\":\"Audit: 52 files changed at 2025-08-29T00:14:15.328Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:15.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"58df031fd52bbe6e6a91304e41cf84e035c4a065\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:11.907Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:11.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"0c803cec316f75c4851c9c59420116f73c31e09c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:09.237Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:09.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cc12209e0fe0e4692cc6880e78caecb76925ea43\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:00.065Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:00.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"f606bc38d23e03c231ac489e3922723589c98443\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:13:01.105Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:13:01.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:54.226Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:54.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"34ae005ae3ce3817f5c8818e187b4f39ee0100fe\",\"message\":\"Audit: 9 files changed at 2025-08-29T00:12:52.267Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:52.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"04d4064f23d78eef1de19c9ad568496a7f5b0f8d\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:51.366Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"7aebf49f0e3975680137f17a58aae7d5aee0d2cb\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:12:50.333Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cdc0ca42b091d9b3d04c953838e76ab033a1702e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:51.146Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"a18b7d43e0b27e220111f15ef1484f8d4632d056\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:36.050Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5148d81ef8ce9875538d322b2656a4fdb635f9b4\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:21.103Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:21.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"de1739d6c08a7ae287a24729d974d2c99454a9d8\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:06.047Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:06.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:50.998Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"aa4a9fb0d49153902b1566e76da6bac1583ee024\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:35.949Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"d4bb99f354d6755ffcf6224fa5d335f0a616d64c\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:44.841Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:45.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"4f62ce2f873e8bc6a679445159731f3a4a8e98bb\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:34.787Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:35.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"24e28eacfc7659984278f9cbb6a4ed003011e214\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:24.732Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"eb84a8c58f87b03bd462af9e33fc5b86439e4032\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:14.703Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:14.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"3fe1622fc7160266821c4e4cad1a2a7b701cc258\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:04.616Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:04.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e91d0988f1ece477046f2633b7af331f32aca72e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:18.357Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:18.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"f17842180ff7a2b6a462b596130c57444ec01a23\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:08.408Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:08.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"9908a119a70c0c91dd8288b4b02d6fcea2cc9016\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:10:50.098Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:10:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:09:49.449Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:09:49.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"test-binary.bin\",\"test-json.json\",\"test-large.txt\",\"test-text.txt\"]}],\"nextCursor\":null}",
          "_meta": {
            "size": 14022
          }
        }
      }
    ],
    "isError": false,
    "structuredContent": {
      "commits": [
        {
          "hash": "7d170c10afbea200f215076aa5ace41ed3b43d85",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:26.790Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b68d6b49a652a19af0bdc8779c8f5d918ec8ef40",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:24.717Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "bd92922f3b633970df5037e81519e289385ee0d1",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:22.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "30d0504c7a46ed483fd0a11df8427dca79e25c8b",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:20.688Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:20.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "ee3ec6b33794d5cd181525e0f8c316d2bb3ef992",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:53.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b49a5261d0f95eb23d36aadda862163432d9709c",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:50.944Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:51.000Z",
          "filesChanged": 2,
          "insertions": 0,
          "deletions": 20,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "f8d0b49f048162b95b8a1bd9cd0729c98c7d008c",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:44.720Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:44.000Z",
          "filesChanged": 2,
          "insertions": 20,
          "deletions": 0,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "53e76e620c5b05a42bac86fe4b17e483dcf16163",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:39.287Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:39.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "6e93307f21aac087c389815cdb816aac3c751a50",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:29.261Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:29.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "bbd35413ed16c23027415587af74d395a1a3437a",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:23.077Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:23.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "880229dddec587c4a72ef371734cc77f128e5d6d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:19.275Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:19.000Z",
          "filesChanged": 10,
          "insertions": 0,
          "deletions": 100,
          "files": [
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "f621080b66e579e7a7b414cb2b6a1f855fe1661a",
          "message": "Audit: 13 files changed at 2025-08-29T00:15:18.121Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:18.000Z",
          "filesChanged": 11,
          "insertions": 100,
          "deletions": 10,
          "files": [
            "temp2_get.md",
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:17.117Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:17.000Z",
          "filesChanged": 2,
          "insertions": 10,
          "deletions": 10,
          "files": [
            "test-get-mcp.cjs",
            "temp2_get.md"
          ]
        },
        {
          "hash": "dd2a0fb7119b840fcd52584bedd461d05149f8db",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:12.315Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:12.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.cjs"
          ]
        },
        {
          "hash": "699f693b16276c39eed756774c94ae72c213a19d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:09.288Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:09.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b5251567bcd3b1a7b30fdf4f752448417aaa144e",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:02.192Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:02.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "4465a1e3e4302841bbd6ef4fe5e38f774bc020d3",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:59.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:59.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "026ddff26c891bd319c41a5ddb8dad05d1ff78ea",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:56.603Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:56.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b97fd07f576068f7bc02f9c7f3145e7e9d265fdf",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:49.274Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:49.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "481efbb68db851d6295094cef2b39e1276e0d78f",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:39.256Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:39.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "6247ac57ce1d5df921441557b4665d70d51e1dfa",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:36.735Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e17e226d4d3bcf0fec035ba516ab6ab665a68de1",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:29.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 4,
          "insertions": 40,
          "deletions": 0,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "b8795f957ef78d85e01cefa80c551a7ea7b8be23",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:29.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5afec307e6143a99e275e3d357ad951c7c45dfc1",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:27.546Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:19.236Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:19.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "674822502f11957e596188e3988b2bb9bcdde0ac",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:16.003Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:16.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "2b452c2e80fca515bee87e4c308029ad40382d22",
          "message": "Audit: 52 files changed at 2025-08-29T00:14:15.328Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:15.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "58df031fd52bbe6e6a91304e41cf84e035c4a065",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:11.907Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:11.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "0c803cec316f75c4851c9c59420116f73c31e09c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:09.237Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:09.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cc12209e0fe0e4692cc6880e78caecb76925ea43",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:00.065Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:00.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "f606bc38d23e03c231ac489e3922723589c98443",
          "message": "Audit: 1 files changed at 2025-08-29T00:13:01.105Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:13:01.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:54.226Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:54.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "34ae005ae3ce3817f5c8818e187b4f39ee0100fe",
          "message": "Audit: 9 files changed at 2025-08-29T00:12:52.267Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:52.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "04d4064f23d78eef1de19c9ad568496a7f5b0f8d",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:51.366Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "7aebf49f0e3975680137f17a58aae7d5aee0d2cb",
          "message": "Audit: 19 files changed at 2025-08-29T00:12:50.333Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cdc0ca42b091d9b3d04c953838e76ab033a1702e",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:51.146Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "a18b7d43e0b27e220111f15ef1484f8d4632d056",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:36.050Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5148d81ef8ce9875538d322b2656a4fdb635f9b4",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:21.103Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:21.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "de1739d6c08a7ae287a24729d974d2c99454a9d8",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:06.047Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:06.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:50.998Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "aa4a9fb0d49153902b1566e76da6bac1583ee024",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:35.949Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "d4bb99f354d6755ffcf6224fa5d335f0a616d64c",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:44.841Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:45.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "4f62ce2f873e8bc6a679445159731f3a4a8e98bb",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:34.787Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:35.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "24e28eacfc7659984278f9cbb6a4ed003011e214",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:24.732Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "eb84a8c58f87b03bd462af9e33fc5b86439e4032",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:14.703Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:14.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "3fe1622fc7160266821c4e4cad1a2a7b701cc258",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:04.616Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:04.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e91d0988f1ece477046f2633b7af331f32aca72e",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:18.357Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:18.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "f17842180ff7a2b6a462b596130c57444ec01a23",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:08.408Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:08.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "9908a119a70c0c91dd8288b4b02d6fcea2cc9016",
          "message": "Audit: 19 files changed at 2025-08-28T23:10:50.098Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:10:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88",
          "message": "Audit: 19 files changed at 2025-08-28T23:09:49.449Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:09:49.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "test-binary.bin",
            "test-json.json",
            "test-large.txt",
            "test-text.txt"
          ]
        }
      ],
      "nextCursor": null
    }
  },
  "jsonrpc": "2.0",
  "id": 4
}
Latest commit: undefined
Previous commit: undefined

============================================================
TEST 4: Basic Restore Preview Tests
============================================================

----------------------------------------
TEST 4.1: Preview restore of text file
----------------------------------------
Preview text file restore: {
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

----------------------------------------
TEST 4.2: Preview restore of deleted binary file
----------------------------------------
Preview binary file restore: {
  "jsonrpc": "2.0",
  "id": 6,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

----------------------------------------
TEST 4.3: Preview restore of code file
----------------------------------------
Preview code file restore: {
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

============================================================
TEST 5: Restore Apply Tests
============================================================

----------------------------------------
TEST 5.1: Apply restore with invalid token
----------------------------------------
Apply with invalid token: {
  "jsonrpc": "2.0",
  "id": 8,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_apply: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"confirm_token\"\n    ],\n    \"message\": \"Required\"\n  },\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"idempotency_key\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

----------------------------------------
TEST 5.2: Apply restore without preview token
----------------------------------------
Apply without preview token: {
  "jsonrpc": "2.0",
  "id": 9,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_apply: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"confirm_token\"\n    ],\n    \"message\": \"Required\"\n  },\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"idempotency_key\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

----------------------------------------
TEST 5.3: Apply text file restore with valid token
----------------------------------------

----------------------------------------
TEST 5.4: Apply restore with backup option
----------------------------------------

----------------------------------------
TEST 5.5: Apply restore of deleted file
----------------------------------------

============================================================
TEST 6: Edge Case Tests
============================================================

----------------------------------------
TEST 6.1: Apply same restore token twice
----------------------------------------

----------------------------------------
TEST 6.2: Apply restore with non-existent paths
----------------------------------------
Preview non-existent file: {
  "jsonrpc": "2.0",
  "id": 10,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

----------------------------------------
TEST 6.3: Apply restore with empty paths array
----------------------------------------
Preview empty paths: {
  "jsonrpc": "2.0",
  "id": 11,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

============================================================
TEST 7: Permission and Safety Tests
============================================================

----------------------------------------
TEST 7.1: Test with read-only file
----------------------------------------
Preview read-only file: {
  "jsonrpc": "2.0",
  "id": 12,
  "error": {
    "code": -32602,
    "message": "MCP error -32602: Invalid arguments for tool unfugit_restore_preview: [\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"string\",\n    \"received\": \"undefined\",\n    \"path\": [\n      \"commit\"\n    ],\n    \"message\": \"Required\"\n  }\n]"
  }
}

============================================================
TEST 8: Final State Verification
============================================================
Final history: {
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 50 commits\n\n7d170c10 - Audit: 19 files changed at 2025-08-29T00:16:26.790Z\nb68d6b49 - Audit: 19 files changed at 2025-08-29T00:16:24.717Z\nbd92922f - Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n30d0504c - Audit: 19 files changed at 2025-08-29T00:16:20.688Z\nee3ec6b3 - Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n... and 45 more commits"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "resource://unfugit/history/list.json",
          "mimeType": "application/json",
          "text": "{\"commits\":[{\"hash\":\"7d170c10afbea200f215076aa5ace41ed3b43d85\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:26.790Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b68d6b49a652a19af0bdc8779c8f5d918ec8ef40\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:24.717Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"bd92922f3b633970df5037e81519e289385ee0d1\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:22.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:22.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"30d0504c7a46ed483fd0a11df8427dca79e25c8b\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:16:20.688Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:16:20.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"ee3ec6b33794d5cd181525e0f8c316d2bb3ef992\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:53.035Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:53.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"b49a5261d0f95eb23d36aadda862163432d9709c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:50.944Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:51.000Z\",\"filesChanged\":2,\"insertions\":0,\"deletions\":20,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"f8d0b49f048162b95b8a1bd9cd0729c98c7d008c\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:44.720Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:44.000Z\",\"filesChanged\":2,\"insertions\":20,\"deletions\":0,\"files\":[\"diff_test_simple.txt\",\"test_binary.bin\"]},{\"hash\":\"53e76e620c5b05a42bac86fe4b17e483dcf16163\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:39.287Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:39.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"6e93307f21aac087c389815cdb816aac3c751a50\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:29.261Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:29.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"bbd35413ed16c23027415587af74d395a1a3437a\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:23.077Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:23.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"880229dddec587c4a72ef371734cc77f128e5d6d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:19.275Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:19.000Z\",\"filesChanged\":10,\"insertions\":0,\"deletions\":100,\"files\":[\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"f621080b66e579e7a7b414cb2b6a1f855fe1661a\",\"message\":\"Audit: 13 files changed at 2025-08-29T00:15:18.121Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:18.000Z\",\"filesChanged\":11,\"insertions\":100,\"deletions\":10,\"files\":[\"temp2_get.md\",\"test file with spaces.txt\",\"test-ascii.txt\",\"test-binary-random.bin\",\"test-data.json\",\"test-fake-png.png\",\"test-large-content.txt\",\"test-mixed.bin\",\"test-utf8.txt\",\"test-файл-测试.txt\",\"test@#$%^&()_+.txt\"]},{\"hash\":\"d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:17.117Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:17.000Z\",\"filesChanged\":2,\"insertions\":10,\"deletions\":10,\"files\":[\"test-get-mcp.cjs\",\"temp2_get.md\"]},{\"hash\":\"dd2a0fb7119b840fcd52584bedd461d05149f8db\",\"message\":\"Audit: 2 files changed at 2025-08-29T00:15:12.315Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:12.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.cjs\"]},{\"hash\":\"699f693b16276c39eed756774c94ae72c213a19d\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:15:09.288Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:09.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b5251567bcd3b1a7b30fdf4f752448417aaa144e\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:15:02.192Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:15:02.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"4465a1e3e4302841bbd6ef4fe5e38f774bc020d3\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:59.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:59.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"026ddff26c891bd319c41a5ddb8dad05d1ff78ea\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:56.603Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:56.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-mcp.js\"]},{\"hash\":\"b97fd07f576068f7bc02f9c7f3145e7e9d265fdf\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:49.274Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:49.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"481efbb68db851d6295094cef2b39e1276e0d78f\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:39.256Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:39.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"6247ac57ce1d5df921441557b4665d70d51e1dfa\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:36.735Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e17e226d4d3bcf0fec035ba516ab6ab665a68de1\",\"message\":\"Audit: 4 files changed at 2025-08-29T00:14:29.686Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":4,\"insertions\":40,\"deletions\":0,\"files\":[\"diff_test_code.py\",\"diff_test_json.json\",\"diff_test_large.txt\",\"diff_test_simple.txt\"]},{\"hash\":\"b8795f957ef78d85e01cefa80c551a7ea7b8be23\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:29.271Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:29.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5afec307e6143a99e275e3d357ad951c7c45dfc1\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:27.546Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:27.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:19.236Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:19.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"674822502f11957e596188e3988b2bb9bcdde0ac\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:16.003Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:16.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"2b452c2e80fca515bee87e4c308029ad40382d22\",\"message\":\"Audit: 52 files changed at 2025-08-29T00:14:15.328Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:15.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"58df031fd52bbe6e6a91304e41cf84e035c4a065\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:14:11.907Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:11.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"test-get-comprehensive.sh\"]},{\"hash\":\"0c803cec316f75c4851c9c59420116f73c31e09c\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:09.237Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:09.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cc12209e0fe0e4692cc6880e78caecb76925ea43\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:14:00.065Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:14:00.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_get.md\"]},{\"hash\":\"f606bc38d23e03c231ac489e3922723589c98443\",\"message\":\"Audit: 1 files changed at 2025-08-29T00:13:01.105Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:13:01.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_get.md\"]},{\"hash\":\"2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:54.226Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:54.000Z\",\"filesChanged\":1,\"insertions\":0,\"deletions\":10,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"34ae005ae3ce3817f5c8818e187b4f39ee0100fe\",\"message\":\"Audit: 9 files changed at 2025-08-29T00:12:52.267Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:52.000Z\",\"filesChanged\":1,\"insertions\":10,\"deletions\":0,\"files\":[\"temp2_ignores.md\"]},{\"hash\":\"04d4064f23d78eef1de19c9ad568496a7f5b0f8d\",\"message\":\"Audit: 8 files changed at 2025-08-29T00:12:51.366Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"7aebf49f0e3975680137f17a58aae7d5aee0d2cb\",\"message\":\"Audit: 19 files changed at 2025-08-29T00:12:50.333Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-29T00:12:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"cdc0ca42b091d9b3d04c953838e76ab033a1702e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:51.146Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"a18b7d43e0b27e220111f15ef1484f8d4632d056\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:36.050Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"5148d81ef8ce9875538d322b2656a4fdb635f9b4\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:21.103Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:21.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"de1739d6c08a7ae287a24729d974d2c99454a9d8\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:24:06.047Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:24:06.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:50.998Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:51.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"aa4a9fb0d49153902b1566e76da6bac1583ee024\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:23:35.949Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:23:36.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"d4bb99f354d6755ffcf6224fa5d335f0a616d64c\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:44.841Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:45.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"4f62ce2f873e8bc6a679445159731f3a4a8e98bb\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:34.787Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:35.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"24e28eacfc7659984278f9cbb6a4ed003011e214\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:24.732Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:24.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"eb84a8c58f87b03bd462af9e33fc5b86439e4032\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:14.703Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:14.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"3fe1622fc7160266821c4e4cad1a2a7b701cc258\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:22:04.616Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:22:04.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"e91d0988f1ece477046f2633b7af331f32aca72e\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:18.357Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:18.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"f17842180ff7a2b6a462b596130c57444ec01a23\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:19:08.408Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:19:08.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"9908a119a70c0c91dd8288b4b02d6fcea2cc9016\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:10:50.098Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:10:50.000Z\",\"filesChanged\":0,\"insertions\":0,\"deletions\":0,\"files\":[]},{\"hash\":\"76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88\",\"message\":\"Audit: 19 files changed at 2025-08-28T23:09:49.449Z\\n\",\"author\":\"unfugit\",\"authorEmail\":\"unfugit@local\",\"date\":\"2025-08-28T23:09:49.000Z\",\"filesChanged\":4,\"insertions\":0,\"deletions\":40,\"files\":[\"test-binary.bin\",\"test-json.json\",\"test-large.txt\",\"test-text.txt\"]}],\"nextCursor\":null}",
          "_meta": {
            "size": 14022
          }
        }
      }
    ],
    "isError": false,
    "structuredContent": {
      "commits": [
        {
          "hash": "7d170c10afbea200f215076aa5ace41ed3b43d85",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:26.790Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b68d6b49a652a19af0bdc8779c8f5d918ec8ef40",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:24.717Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "bd92922f3b633970df5037e81519e289385ee0d1",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:22.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:22.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "30d0504c7a46ed483fd0a11df8427dca79e25c8b",
          "message": "Audit: 19 files changed at 2025-08-29T00:16:20.688Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:16:20.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "ee3ec6b33794d5cd181525e0f8c316d2bb3ef992",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:53.035Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:53.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "b49a5261d0f95eb23d36aadda862163432d9709c",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:50.944Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:51.000Z",
          "filesChanged": 2,
          "insertions": 0,
          "deletions": 20,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "f8d0b49f048162b95b8a1bd9cd0729c98c7d008c",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:44.720Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:44.000Z",
          "filesChanged": 2,
          "insertions": 20,
          "deletions": 0,
          "files": [
            "diff_test_simple.txt",
            "test_binary.bin"
          ]
        },
        {
          "hash": "53e76e620c5b05a42bac86fe4b17e483dcf16163",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:39.287Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:39.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "6e93307f21aac087c389815cdb816aac3c751a50",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:29.261Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:29.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "bbd35413ed16c23027415587af74d395a1a3437a",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:23.077Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:23.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "880229dddec587c4a72ef371734cc77f128e5d6d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:19.275Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:19.000Z",
          "filesChanged": 10,
          "insertions": 0,
          "deletions": 100,
          "files": [
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "f621080b66e579e7a7b414cb2b6a1f855fe1661a",
          "message": "Audit: 13 files changed at 2025-08-29T00:15:18.121Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:18.000Z",
          "filesChanged": 11,
          "insertions": 100,
          "deletions": 10,
          "files": [
            "temp2_get.md",
            "test file with spaces.txt",
            "test-ascii.txt",
            "test-binary-random.bin",
            "test-data.json",
            "test-fake-png.png",
            "test-large-content.txt",
            "test-mixed.bin",
            "test-utf8.txt",
            "test-файл-测试.txt",
            "test@#$%^&()_+.txt"
          ]
        },
        {
          "hash": "d2ea5f9d3dd8e419ae64db6a0dec9314b04e5670",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:17.117Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:17.000Z",
          "filesChanged": 2,
          "insertions": 10,
          "deletions": 10,
          "files": [
            "test-get-mcp.cjs",
            "temp2_get.md"
          ]
        },
        {
          "hash": "dd2a0fb7119b840fcd52584bedd461d05149f8db",
          "message": "Audit: 2 files changed at 2025-08-29T00:15:12.315Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:12.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.cjs"
          ]
        },
        {
          "hash": "699f693b16276c39eed756774c94ae72c213a19d",
          "message": "Audit: 19 files changed at 2025-08-29T00:15:09.288Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:09.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b5251567bcd3b1a7b30fdf4f752448417aaa144e",
          "message": "Audit: 1 files changed at 2025-08-29T00:15:02.192Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:15:02.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "4465a1e3e4302841bbd6ef4fe5e38f774bc020d3",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:59.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:59.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "026ddff26c891bd319c41a5ddb8dad05d1ff78ea",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:56.603Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:56.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-mcp.js"
          ]
        },
        {
          "hash": "b97fd07f576068f7bc02f9c7f3145e7e9d265fdf",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:49.274Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:49.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "481efbb68db851d6295094cef2b39e1276e0d78f",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:39.256Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:39.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "6247ac57ce1d5df921441557b4665d70d51e1dfa",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:36.735Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e17e226d4d3bcf0fec035ba516ab6ab665a68de1",
          "message": "Audit: 4 files changed at 2025-08-29T00:14:29.686Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 4,
          "insertions": 40,
          "deletions": 0,
          "files": [
            "diff_test_code.py",
            "diff_test_json.json",
            "diff_test_large.txt",
            "diff_test_simple.txt"
          ]
        },
        {
          "hash": "b8795f957ef78d85e01cefa80c551a7ea7b8be23",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:29.271Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:29.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5afec307e6143a99e275e3d357ad951c7c45dfc1",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:27.546Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:27.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5a83a82e1edd7ba073d9e0c1bed94d6c8e6f8a3c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:19.236Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:19.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "674822502f11957e596188e3988b2bb9bcdde0ac",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:16.003Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:16.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "2b452c2e80fca515bee87e4c308029ad40382d22",
          "message": "Audit: 52 files changed at 2025-08-29T00:14:15.328Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:15.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "58df031fd52bbe6e6a91304e41cf84e035c4a065",
          "message": "Audit: 1 files changed at 2025-08-29T00:14:11.907Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:11.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "test-get-comprehensive.sh"
          ]
        },
        {
          "hash": "0c803cec316f75c4851c9c59420116f73c31e09c",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:09.237Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:09.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cc12209e0fe0e4692cc6880e78caecb76925ea43",
          "message": "Audit: 19 files changed at 2025-08-29T00:14:00.065Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:14:00.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "f606bc38d23e03c231ac489e3922723589c98443",
          "message": "Audit: 1 files changed at 2025-08-29T00:13:01.105Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:13:01.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_get.md"
          ]
        },
        {
          "hash": "2f6c4b8b6d60d11db2fcbef227663b4f1f2b6d8b",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:54.226Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:54.000Z",
          "filesChanged": 1,
          "insertions": 0,
          "deletions": 10,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "34ae005ae3ce3817f5c8818e187b4f39ee0100fe",
          "message": "Audit: 9 files changed at 2025-08-29T00:12:52.267Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:52.000Z",
          "filesChanged": 1,
          "insertions": 10,
          "deletions": 0,
          "files": [
            "temp2_ignores.md"
          ]
        },
        {
          "hash": "04d4064f23d78eef1de19c9ad568496a7f5b0f8d",
          "message": "Audit: 8 files changed at 2025-08-29T00:12:51.366Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "7aebf49f0e3975680137f17a58aae7d5aee0d2cb",
          "message": "Audit: 19 files changed at 2025-08-29T00:12:50.333Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-29T00:12:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "cdc0ca42b091d9b3d04c953838e76ab033a1702e",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:51.146Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "a18b7d43e0b27e220111f15ef1484f8d4632d056",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:36.050Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "5148d81ef8ce9875538d322b2656a4fdb635f9b4",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:21.103Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:21.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "de1739d6c08a7ae287a24729d974d2c99454a9d8",
          "message": "Audit: 19 files changed at 2025-08-28T23:24:06.047Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:24:06.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "1de28e489ce6343ae3e4e69a3b231a2fb7e9e7f5",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:50.998Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:51.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "aa4a9fb0d49153902b1566e76da6bac1583ee024",
          "message": "Audit: 19 files changed at 2025-08-28T23:23:35.949Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:23:36.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "d4bb99f354d6755ffcf6224fa5d335f0a616d64c",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:44.841Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:45.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "4f62ce2f873e8bc6a679445159731f3a4a8e98bb",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:34.787Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:35.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "24e28eacfc7659984278f9cbb6a4ed003011e214",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:24.732Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:24.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "eb84a8c58f87b03bd462af9e33fc5b86439e4032",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:14.703Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:14.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "3fe1622fc7160266821c4e4cad1a2a7b701cc258",
          "message": "Audit: 19 files changed at 2025-08-28T23:22:04.616Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:22:04.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "e91d0988f1ece477046f2633b7af331f32aca72e",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:18.357Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:18.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "f17842180ff7a2b6a462b596130c57444ec01a23",
          "message": "Audit: 19 files changed at 2025-08-28T23:19:08.408Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:19:08.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "9908a119a70c0c91dd8288b4b02d6fcea2cc9016",
          "message": "Audit: 19 files changed at 2025-08-28T23:10:50.098Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:10:50.000Z",
          "filesChanged": 0,
          "insertions": 0,
          "deletions": 0,
          "files": []
        },
        {
          "hash": "76e65e496fbdc66eb7a70731f5e9dbd37d4f9d88",
          "message": "Audit: 19 files changed at 2025-08-28T23:09:49.449Z\n",
          "author": "unfugit",
          "authorEmail": "unfugit@local",
          "date": "2025-08-28T23:09:49.000Z",
          "filesChanged": 4,
          "insertions": 0,
          "deletions": 40,
          "files": [
            "test-binary.bin",
            "test-json.json",
            "test-large.txt",
            "test-text.txt"
          ]
        }
      ],
      "nextCursor": null
    }
  },
  "jsonrpc": "2.0",
  "id": 13
}
Final stats: {
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Server v1.0.0, role: passive, repo: 160 commits, 0KB"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "resource://unfugit/stats.json",
          "mimeType": "application/json",
          "text": "{\"version\":\"1.0.0\",\"role\":\"passive\",\"read_only\":true,\"session_id\":\"5c819f27-6767-4605-b552-24cdfe308c72\",\"repo\":{\"path\":\"/home/user/.local/share/unfugit/repos/7eda38e2fc58d0db_home-user-claude-mcp-servers-unfugit\",\"total_commits\":160,\"session_commits\":0,\"size_bytes\":0,\"objects\":0,\"packs\":0,\"last_fsck\":null,\"last_maintenance\":null},\"limits\":{\"maxBytesPerResult\":1048576,\"serverTimeoutMs\":30000,\"cursorTtlSeconds\":600,\"resourceTtlSeconds\":900}}",
          "_meta": {
            "size": 444
          }
        }
      }
    ],
    "isError": false,
    "structuredContent": {
      "version": "1.0.0",
      "role": "passive",
      "read_only": true,
      "session_id": "5c819f27-6767-4605-b552-24cdfe308c72",
      "repo": {
        "path": "/home/user/.local/share/unfugit/repos/7eda38e2fc58d0db_home-user-claude-mcp-servers-unfugit",
        "total_commits": 160,
        "session_commits": 0,
        "size_bytes": 0,
        "objects": 0,
        "packs": 0,
        "last_fsck": null,
        "last_maintenance": null
      },
      "limits": {
        "maxBytesPerResult": 1048576,
        "serverTimeoutMs": 30000,
        "cursorTtlSeconds": 600,
        "resourceTtlSeconds": 900
      }
    }
  },
  "jsonrpc": "2.0",
  "id": 14
}

============================================================
TEST SUMMARY
============================================================
test-restore-target.txt: EXISTS
  Content: "Modified content line 1\nModified content line 2\nNew line 3\n"
test-restore-target.bin: MISSING
test-restore-target.py: EXISTS
  Content: "def modified_function():\n    return "modified"\n\ndef new_function():\n    return "new"\n"
test-restore-target.py.backup: MISSING
MCP server stopped

Test completed: 2025-08-29T02:34:50.363Z
