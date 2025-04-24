const querystring = require("querystring");
const axios = require("axios");
const mongoose = require('mongoose');
const dotenv = require("dotenv");
dotenv.config();
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;


const getAuthUrl = (origin, orgId) => {
  const state = JSON.stringify({ origin, orgId });
  const params = querystring.stringify({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email offline_access User.Read Mail.Read Mail.ReadWrite",
    state: encodeURIComponent(state),
    prompt: "select_account"
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
};


const getAccessToken = async (code, orgId) => {
  const Account = mongoose.model("Account");

  try {
    const tokenResponse = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, scope, token_type, expires_in } = tokenResponse.data;

    const userInfo = await getUserDetails(access_token);
    const email = userInfo.userPrincipalName || userInfo.mail;
    const username = email.split("@")[0];

    let account = await Account.findOne({ email: userInfo.mail });

    if (!account) {
      account = new Account({
        email: userInfo.mail,
        name: username,
        account: userInfo.mail,
        type: "outlook",
        orgId,
        oauth2: {
          authorize: true,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          redirectUri: REDIRECT_URI,
          tokens: { 
            access_token, 
            refresh_token, 
            scope, 
            token_type, 
            expires_in,
            expires_at: Date.now() + expires_in * 1000 
          },
        },
        createdAt: new Date(),
      });
    } else {
      account.orgId = orgId;
      account.oauth2 = {
        authorize: true,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
        tokens: { 
          access_token, 
          refresh_token, 
          scope, 
          token_type, 
          expires_in,
          expires_at: Date.now() + expires_in * 1000 
        },
      };
    }

    await account.save();
    return { access_token, refresh_token, scope, token_type, expires_in };
  } catch (error) {
    console.error("Error fetching access token:", error.response?.data || error.message);
    throw new Error("Failed to fetch access token");
  }
};


const getUserDetails = async (accessToken) => {
  try {
    const userResponse = await axios.get("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return userResponse.data;
  } catch (error) {
    console.error("Error fetching user details:", error.response?.data || error.message);
    throw new Error("Failed to fetch user details");
  }
};


const refreshMicrosoftOAuthToken = async (account) => {
  try {
    if (!account?.oauth2?.tokens?.refresh_token) {
      throw new Error("Missing refresh token. Please log in again.");
    }

    const now = Date.now();
    const expiresAt = account.oauth2.tokens.expires_at;
    if (expiresAt && expiresAt > now + 300000) {
      return account.oauth2.tokens;
    }

    const tokenResponse = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: account.oauth2.tokens.refresh_token,
        grant_type: "refresh_token",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in, token_type, scope } =
      tokenResponse.data;

    account.oauth2.tokens = {
      access_token,
      refresh_token: refresh_token || account.oauth2.tokens.refresh_token,
      expires_in,
      token_type,
      scope,
      expires_at: Date.now() + expires_in * 1000
    };

    await account.save();

    return account.oauth2.tokens;
  } catch (error) {
    if (error.response?.status === 400 &&   error.response?.data?.error === 'invalid_grant') {
      console.error("Invalid refresh token, user needs to re-authenticate");
      if (account.oauth2) {
        account.oauth2.authorize = false;
        await account.save();
      }
      throw new Error("Your session has expired. Please sign in again.");
    }

    console.error("Error refreshing access token:", error.response?.data || error.message);
    throw new Error("Failed to refresh access token");
  }
};


const getOutlookMailboxes = async (accessToken) => {
  try {
    const response = await axios.get(
      "https://graph.microsoft.com/v1.0/me/mailFolders?$top=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Outlook API Error: ${response.statusText}`);
    }

    const folders = response.data.value || [];
    
    const mailboxData = folders.map((folder) => ({
      name: folder.displayName,
      path: folder.id,
      totalMessages: folder.totalItemCount || 0,
      unseenMessages: folder.unreadItemCount || 0,
      updatedAt: new Date(),
    }));

    return { labels: mailboxData };
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error("Unauthorized: Your authentication token may have expired");
    }
    console.error("Error fetching Outlook mailboxes:", error.response?.data || error.message);
    throw new Error("Failed to fetch Outlook mailboxes");
  }
};


const getOutlookMessages = async (accessToken, folderId, limit = 50, skip = 0, filter = '') => {
  try {
    console.log(`🔍 Fetching messages from Outlook folder ID: ${folderId}`);
    
    let endpoint;
    
    if (folderId === 'inbox' || folderId === 'Inbox') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages`;
    } else if (folderId === 'sentitems' || folderId === 'SentItems' || folderId === 'Sent Items') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages`;
    } else if (folderId === 'drafts' || folderId === 'Drafts') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/drafts/messages`;
    } else if (folderId === 'deleteditems' || folderId === 'DeletedItems' || folderId === 'Deleted Items') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/deleteditems/messages`;
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`;
    }
    
    let queryParams = `?$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients,isRead,hasAttachments&$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc`;
    
    // Add filter if provided
    if (filter) {
      queryParams += `&$filter=${encodeURIComponent(filter)}`;
      console.log(`Applied filter: ${filter}`);
    }
    
    const response = await axios.get(
      `${endpoint}${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          'Content-Type': 'application/json',
          'Prefer': 'outlook.body-content-type="text"'
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Outlook API Error: ${response.statusText}`);
    }
    
    const messages = response.data.value || [];
    console.log(`📬 Retrieved ${messages.length} messages from folder`);

    return {
      messages: messages,
      hasMoreMessages: response.data["@odata.nextLink"] ? true : false,
      nextLink: response.data["@odata.nextLink"] || null
    };
  } catch (error) {
    if (error.response?.status === 404) {
      console.error(`Folder not found with ID: ${folderId}. This may be an invalid folder ID.`);
      return { messages: [], hasMoreMessages: false, nextLink: null };
    }
    
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 10;
      throw new Error(`Rate limit exceeded. Try again after ${retryAfter} seconds.`);
    }
    
    console.error("Error fetching Outlook messages:", error.response?.data || error.message);
    throw new Error(`Failed to fetch Outlook messages for folder: ${folderId}`);
  }
};

const getOutlookMessageDetail = async (accessToken, messageId, retries = 3) => {
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=id,subject,body,receivedDateTime,from,toRecipients,isRead,hasAttachments,importance,attachments`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          'Prefer': 'outlook.body-content-type="text"'
        },
      }
    );

    if (response.status !== 200) {
      throw new Error(`Outlook API Error: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 2;
      console.log(`⏱️ Rate limited getting message ${messageId}, retrying after ${retryAfter} seconds...`);
      
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      
      return getOutlookMessageDetail(accessToken, messageId, retries - 1);
    }
    
    const errorDetails = error.response ? {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data
    } : error.message;
    
    console.error(`Error fetching Outlook message detail for ID ${messageId}:`, errorDetails);
    throw new Error(`Failed to fetch Outlook message detail for ID: ${messageId}`);
  }
};


const getOutlookAttachment = async (accessToken, messageId, attachmentId) => {
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    if (response.status !== 200) {
      throw new Error(`Outlook API Error: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Error fetching attachment ${attachmentId}:`, error.response?.data || error.message);
    throw new Error(`Failed to fetch attachment: ${attachmentId}`);
  }
};


const markOutlookMessageReadStatus = async (accessToken, messageId, isRead) => {
  try {
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
      { isRead },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error(`Error marking message ${messageId} as ${isRead ? 'read' : 'unread'}:`, error.response?.data || error.message);
    throw new Error(`Failed to mark message as ${isRead ? 'read' : 'unread'}`);
  }
};


const sendOutlookMessage = async (accessToken, messageData) => {
  try {
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        message: {
          subject: messageData.subject,
          body: {
            contentType: messageData.isHtml ? 'html' : 'text',
            content: messageData.body
          },
          toRecipients: messageData.to.map(recipient => ({
            emailAddress: {
              address: recipient
            }
          })),
          ccRecipients: messageData.cc?.map(recipient => ({
            emailAddress: {
              address: recipient
            }
          })) || [],
          bccRecipients: messageData.bcc?.map(recipient => ({
            emailAddress: {
              address: recipient
            }
          })) || []
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw new Error('Failed to send message');
  }
};

module.exports = { 
  getAuthUrl, 
  getAccessToken, 
  getUserDetails, 
  refreshMicrosoftOAuthToken,
  getOutlookMailboxes,
  getOutlookMessages,
  getOutlookMessageDetail,
  getOutlookAttachment,
  markOutlookMessageReadStatus,
  sendOutlookMessage
};
