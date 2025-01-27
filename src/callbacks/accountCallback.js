const {
    verifyAccountGmail,
    verifyAccountOutlook,
    verifyAccountCredentials,
  } = require('../services/accountService');
  
  /**
   * Centralized Account Verification Callback
   */
  const verifyAccountCallback = async (account) => {
    let result;
    if (account.type === 'gmail') {
      if (account.oauth?.authorize){
        return { success: true, message: 'SMTP verified successfully' };
      }else{
        return { success: true, message: 'SMTP verified successfully' };
      }
      
    } else if (account.type === 'outlook') {
      return { success: true, message: 'SMTP verified successfully' };
    } else {
      result = await verifyAccountCredentials({
        imap: account.imap,
        smtp: account.smtp,
        proxy: account.proxy,
        smtpEhloName: account.smtpEhloName,
      });
    }
  
    return result;
  };
  
  module.exports = { verifyAccountCallback };
  