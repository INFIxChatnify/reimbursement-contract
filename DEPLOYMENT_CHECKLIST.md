# Deployment Security Checklist

## ⚠️ Pre-Deployment

- [ ] Create a fresh wallet specifically for deployment
- [ ] Fund the deployment wallet with only necessary gas
- [ ] Copy the private key to `.env` file (create from `.env.example`)
- [ ] Set `DEPLOYER_PRIVATE_KEY` in `.env` (without 0x prefix)
- [ ] **NEVER commit `.env` file to version control**

## 🚀 Deployment

- [ ] Run deployment script: `npm run deploy:omchain`
- [ ] Save the deployment output and contract addresses
- [ ] Verify contracts on blockchain explorer

## 🔒 Post-Deployment (CRITICAL)

- [ ] **Transfer ownership of all contracts to secure wallet/multisig**
- [ ] Verify ownership transfer completed successfully
- [ ] **DELETE the private key from `.env` file immediately**
- [ ] Clear terminal history: `history -c` (Linux/Mac) or `cls` (Windows)
- [ ] Store contract addresses in secure location

## 🛡️ Security Best Practices

1. **Use a dedicated deployment wallet** - Never use your main wallet
2. **Minimal funding** - Only transfer enough for gas fees
3. **Quick transfer** - Transfer ownership immediately after deployment
4. **Clean up** - Remove private keys from all files after use
5. **Audit trail** - Keep deployment logs but remove sensitive data

## 📝 Example .env Setup

```bash
# Copy from .env.example
cp .env.example .env

# Edit .env and add your deployment private key
# DEPLOYER_PRIVATE_KEY=your_64_character_hex_key_without_0x
```

## 🚨 Emergency Procedures

If private key is compromised:
1. Immediately transfer ownership to new secure wallet
2. Pause contracts if possible
3. Notify team members
4. Review all transactions from compromised wallet